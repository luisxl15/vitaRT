"""vitart Mod Kit: biblioteca e linha de comando do carregador de mods do vitart (docs/modding/README.md).
A interface gráfica é o tools/vitart_modstudio.py.

    python tools/vitart_modkit.py list
    python tools/vitart_modkit.py enable|disable <id>
    python tools/vitart_modkit.py rebuild
    python tools/vitart_modkit.py convert-ps2 <gow2> <patch.xdelta|mod.zip> <ISO|.7z> <id> "<nome>" [--author A]
    python tools/vitart_modkit.py textures <gow1|gow2> <wad/..wad_psp2>                 # lista as texturas
    python tools/vitart_modkit.py export-tex <jogo> <wad> <registro ~...> <saída.png>
    python tools/vitart_modkit.py texture-mod <jogo> <id> "<nome>" <wad>=<registro>=<png> [...]
    python tools/vitart_modkit.py text-mod <jogo> <id> "<nome>" <textos.txt> [--wad wad/_VitaTV/r_perma.wad_psp2]
    python tools/vitart_modkit.py translations | build-translation <código> | language [<código>] | migrate-text-mods

Um mod é uma pasta em <vitart-data>/mods/<id>/:
    mod.ini        name, game (gow1/gow2), author, version, description
    files/<caminho no psarc>   arquivos inteiros que substituem os do jogo (ex.: files/wad/_VitaTV/r_hero01.wad_psp2)
    src/<caminho no psarc>     arquivos que o patch do vitart também muda (r_perma, r_shella): o rebuild aplica por
                               cima deles o menu e os ícones do vitart e grava o resultado em files/
    entries.tsv    gerado pelo rebuild: "<psarc>\\t<entrada da TOC>\\tfiles/<caminho>" (o que o vitart lê)
    records.tsv    troca de registros dentro de um WAD (ex.: os textos MSGS_TXT de uma tradução):
                   "<psarc>\\t<entrada>\\t<tag>\\t<registro>\\t<ocorrência>\\t<arquivo ou =valor>"
<vitart-data>/mods/modlist.tsv dá a ordem (e o índice na página Mods do menu de pausa); ligar = mod_<id>=1 no
vitart_options.ini. No jogo, Options > Mods > Apply liga/desliga na hora os mods de arquivo inteiro; se o herói, o
HUD ou os menus mudaram, o jogo reinicia sozinho com tudo aplicado.
"""
import configparser
import io
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile

FROZEN = getattr(sys, 'frozen', False)
if FROZEN:
    # exe do PyInstaller (tools/build_exes.py): o código vem de dentro do exe; as ferramentas chamadas por
    # subprocesso, a documentação e a configuração ficam no repositório, achado por VITART_REPO ou pela posição
    # do exe (gow-dump/rt -> ../../vita-recomp-lab).
    REPO = os.environ.get('VITART_REPO') or os.path.normpath(
        os.path.join(os.path.dirname(sys.executable), '..', '..', 'vita-recomp-lab'))
    TOOLS = os.path.join(REPO, 'tools')
else:
    TOOLS = os.path.dirname(os.path.abspath(__file__))
    REPO = os.path.dirname(TOOLS)
sys.path.insert(0, TOOLS)

PSARC = {'gow1': 'gow1_psp2_SCEA.psarc', 'gow2': 'gow2_psp2_SCEA.psarc'}
# arquivos que o patch do próprio vitart muda (tools/gow_menu_mod.py): um mod que os troca guarda a versão dele em src/
BASE_FILES = ('wad/r_perma.wad_psp2', 'wad/_VitaTV/r_perma.wad_psp2', 'wad/r_shella.wad_psp2', 'wad/_VitaTV/r_shella.wad_psp2')
CONFIG = os.path.join(TOOLS, 'modkit_config.json')


# ------------------------------------------------------------------ configuração
def default_config():
    proj = os.path.dirname(REPO)
    inst = os.path.dirname(REPO)  # jogo instalado: <jogo>/Ferramentas/tools, com <jogo>/game e <jogo>/data
    if os.path.isdir(os.path.join(inst, 'game', 'PCSA00126')) and os.path.isdir(os.path.join(inst, 'data')):
        return {
            'app': os.path.join(inst, 'game', 'PCSA00126'),
            'data': os.path.join(inst, 'data'),
            'work': os.path.join(inst, 'data', 'modkit_work'),
            'xdelta3': os.path.join(TOOLS, 'bin', 'xdelta3.exe'),
            'sevenzip': r'C:\Program Files\7-Zip\7z.exe',
            'python': sys.executable or shutil.which('python') or 'python',  # o Python portátil de Ferramentas, se for ele
        }
    return {
        'app': os.path.join(proj, '_deps', 'vita3k-win', 'bin', 'portable', 'fs', 'ux0', 'app', 'PCSA00126'),
        'data': os.path.join(proj, 'gow-dump', 'vitart-data'),
        'work': os.path.join(proj, 'gow-dump', 'modkit_work'),
        'xdelta3': os.path.join(TOOLS, 'bin', 'xdelta3.exe'),
        'sevenzip': r'C:\Program Files\7-Zip\7z.exe',
        'python': (shutil.which('python') or 'python') if FROZEN else sys.executable,
    }


def load_config():
    cfg = default_config()
    if os.path.exists(CONFIG):
        cfg.update(json.load(open(CONFIG, encoding='utf-8')))
    # Python gravado de outra máquina (ou de antes do Python portátil): usa o que está rodando agora
    if not (cfg.get('python') and (os.path.exists(cfg['python']) or shutil.which(cfg['python']))):
        cfg['python'] = sys.executable
    return cfg


def save_config(cfg):
    json.dump(cfg, open(CONFIG, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)


def mods_dir(cfg):
    return os.path.join(cfg['data'], 'mods')


def psarc_path(cfg, game):
    return os.path.join(cfg['app'], 'exec', PSARC[game])


# ------------------------------------------------------------------ psarc
_MANIFEST = {}


def manifest(psarc):
    """Nomes do psarc na ordem da TOC (entrada k+1 = nomes[k])."""
    import psarc_gxp as P
    if psarc not in _MANIFEST:
        with open(psarc, 'rb') as fh:
            ents, zs, block = P.entries(fh)
            _MANIFEST[psarc] = (P.read_file(fh, ents[0], zs, block).decode('latin1').split('\n'), ents, zs, block)
    return _MANIFEST[psarc][0]


def read_psarc_file(psarc, name):
    import psarc_gxp as P
    names, ents, zs, block = manifest(psarc), *_MANIFEST[psarc][1:]
    with open(psarc, 'rb') as fh:
        return P.read_file(fh, ents[names.index(name) + 1], zs, block)


# ------------------------------------------------------------------ WAD (GoW1: dados na tag 30; GoW2: tag 1)
def wad_records(d, game):
    nobody = (0, 2, 3, 24) if game == 'gow2' else (24,)
    o, out = 0, []
    while o + 32 <= len(d):
        tag, flags, size = struct.unpack_from('<HHI', d, o)
        name = d[o + 8:o + 32].split(b'\0')[0].decode('latin1')
        nb = tag in nobody
        out.append([tag, flags, name, d[o + 32:o + 32 + (0 if nb else size)], not nb, size])
        o = (o + 32 + (0 if nb else size) + 15) & ~15
    return out


def wad_write(recs):
    import gow2_mod_wad
    return gow2_mod_wad.write(recs)


def is_texture(rec):
    b = rec[3]
    return rec[4] and rec[2].startswith('~') and len(b) >= 14 + 64 and b[:4] == b'\x07\x00\x07\x00' and b[14:18] == b'GXT\0'


def wad_textures(wad, game):
    """[(nome do registro, largura, altura, formato)] das texturas do Vita do WAD."""
    out = []
    for r in wad_records(wad, game):
        if is_texture(r):
            off, size, pal, flags, ty, fmt, w, h = struct.unpack_from('<6I2H', r[3], 14 + 32)
            out.append((r[2], w, h, {0x85000000: 'BC1', 0x86000000: 'BC2', 0x87000000: 'BC3', 0x95000000: 'P8',
                                      0x0C000000: 'RGBA8'}.get(fmt & 0xFF000000, hex(fmt))))
    return out


def texture_rgba(wad, game, recname):
    """Decodifica a textura (o 1o nível) para um array RGBA."""
    import gxm_tex_dump as D
    import texpack_match as TM
    rec = next(r for r in wad_records(wad, game) if r[2] == recname)
    gxt = rec[3][14:]
    ti, t, poff = TM.gxt_textures(gxt)[0]
    return D.decode(TM.GxtMem(gxt), t)


def replace_texture(wad, game, recname, rgba):
    """Troca a textura do registro '~' por rgba (BC3 com mipmaps; qualquer tamanho potência de 2)."""
    import gow2_mod_wad
    recs = wad_records(wad, game)
    for r in recs:
        if r[2] == recname and is_texture(r):
            r[3] = gow2_mod_wad.tex_record(r[3], rgba)
            return wad_write(recs)
    raise KeyError(recname)


# ------------------------------------------------------------------ mods instalados
class Mod:
    def __init__(self, cfg, mid):
        self.id = mid
        self.dir = os.path.join(mods_dir(cfg), mid)
        ini = configparser.ConfigParser(interpolation=None)
        p = os.path.join(self.dir, 'mod.ini')
        if os.path.exists(p):
            txt = open(p, encoding='utf-8').read()
            ini.read_string('[mod]\n' + txt if not txt.lstrip().startswith('[') else txt)
        sec = ini[ini.sections()[0]] if ini.sections() else {}
        self.name = sec.get('name', mid)
        self.game = sec.get('game', 'gow2')
        self.author = sec.get('author', '')
        self.version = sec.get('version', '')
        self.description = sec.get('description', '')
        self.enabled = False

    def files(self, sub='files'):
        root = os.path.join(self.dir, sub)
        out = []
        for d, _, fs in os.walk(root):
            for f in fs:
                out.append(os.path.relpath(os.path.join(d, f), root).replace('\\', '/'))
        return sorted(out)

    def size(self):
        return sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(self.dir) for f in fs)


def ini_path(cfg):
    return os.path.join(cfg['data'], 'vitart_options.ini')


def enabled_ids(cfg):
    on = set()
    if os.path.exists(ini_path(cfg)):
        for line in open(ini_path(cfg), encoding='utf-8', errors='replace'):
            m = re.match(r'mod_([A-Za-z0-9_]+)=(\d+)', line.strip())
            if m and int(m.group(2)):
                on.add(m.group(1))
    return on


def set_enabled(cfg, mid, on):
    """mod_<id>=0/1 no vitart_options.ini, mantendo as outras linhas."""
    lines = open(ini_path(cfg), encoding='utf-8', errors='replace').read().splitlines() if os.path.exists(ini_path(cfg)) else []
    key = 'mod_%s=' % mid
    lines = [l for l in lines if not l.startswith(key)] + [key + ('1' if on else '0')]
    open(ini_path(cfg), 'w', encoding='utf-8', newline='\n').write('\n'.join(lines) + '\n')


def read_modlist(cfg):
    out = []
    p = os.path.join(mods_dir(cfg), 'modlist.tsv')
    if os.path.exists(p):
        for line in open(p, encoding='utf-8'):
            f = line.rstrip('\r\n').split('\t')
            if len(f) >= 3:
                out.append(f[2])
    return out


def list_mods(cfg):
    root = mods_dir(cfg)
    ids = [d for d in sorted(os.listdir(root)) if os.path.isfile(os.path.join(root, d, 'mod.ini'))] if os.path.isdir(root) else []
    order = [i for i in read_modlist(cfg) if i in ids] + [i for i in ids if i not in read_modlist(cfg)]
    on = enabled_ids(cfg)
    mods = []
    for mid in order:
        m = Mod(cfg, mid)
        m.enabled = mid in on
        mods.append(m)
    return mods


def write_modlist(cfg, mods):
    """mods/modlist.tsv: "<jogo>\\t<índice no menu do jogo>\\t<id>\\t<nome>" (até 16 por jogo)."""
    lines, idx = [], {}
    for m in mods:
        i = idx.get(m.game, 0)
        if i >= 16:
            continue
        idx[m.game] = i + 1
        lines.append('%s\t%d\t%s\t%s' % (m.game, i, m.id, m.name.replace('\t', ' ')))
    os.makedirs(mods_dir(cfg), exist_ok=True)
    open(os.path.join(mods_dir(cfg), 'modlist.tsv'), 'w', encoding='utf-8', newline='\n').write('\n'.join(lines) + '\n')


def safe_id(text):
    s = re.sub(r'[^A-Za-z0-9_]+', '_', text.strip()).strip('_').lower()
    return s or 'mod'


def install_mod(cfg, mid, name, game, files, author='', version='1.0', description='', log=print):
    """Cria (ou substitui) <mods>/<id> com os arquivos {caminho no psarc: bytes}. Não reconstrói (rebuild)."""
    mid = safe_id(mid)
    d = os.path.join(mods_dir(cfg), mid)
    if os.path.isdir(d):
        shutil.rmtree(d)
    os.makedirs(d)
    for name_in_psarc, body in files.items():
        sub = 'src' if name_in_psarc in BASE_FILES else 'files'
        dst = os.path.join(d, sub, *name_in_psarc.split('/'))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        open(dst, 'wb').write(body)
    ini = ['# Mod do vitart (docs/modding/README.md)', 'name=%s' % name, 'game=%s' % game, 'author=%s' % author,
           'version=%s' % version, 'description=%s' % description.replace('\n', ' ')]
    open(os.path.join(d, 'mod.ini'), 'w', encoding='utf-8', newline='\n').write('\n'.join(ini) + '\n')
    log('mod %s instalado em %s (%d arquivos)' % (mid, d, len(files)))
    return mid


def run(cmd, log=print, cwd=None):
    """Roda um comando e manda a saída para log, linha a linha."""
    log('> ' + ' '.join('"%s"' % c if ' ' in c else c for c in cmd))
    env = dict(os.environ, PYTHONIOENCODING='utf-8')  # as ferramentas imprimem em português
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, cwd=cwd, text=True, encoding='utf-8',
                         errors='replace', env=env, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    for line in p.stdout:
        log(line.rstrip())
    if p.wait() != 0:
        raise RuntimeError('falhou (código %d): %s' % (p.returncode, cmd[1] if len(cmd) > 1 else cmd[0]))


def rebuild(cfg, log=print):
    """Lista de mods, patch base de cada jogo (menu com a página Mods) e os arquivos src/ dos mods com o menu do
    vitart por cima; depois o entries.tsv de cada mod."""
    mods = list_mods(cfg)
    write_modlist(cfg, mods)
    modlist = os.path.join(mods_dir(cfg), 'modlist.tsv')
    py = [cfg['python'], '-P', os.path.join(TOOLS, 'gow_menu_mod.py')]
    lang = ['--lang', get_language(cfg)] if get_language(cfg) else []  # o menu do vitart no idioma do jogo
    for game in ('gow1', 'gow2'):
        ps = psarc_path(cfg, game)
        if not os.path.exists(ps):
            continue
        log('== %s: patch base' % game)
        run(py + [ps, os.path.join(mods_dir(cfg), PSARC[game] + '.vtpatch'), '--modlist', modlist] + lang, log)
        for m in mods:
            if m.game != game or not m.files('src'):
                continue
            log('== %s: %s com o menu do vitart' % (game, ', '.join(m.files('src'))))
            tmp = tempfile.mkdtemp(prefix='modkit_')
            args = []
            for rel in sorted(m.files('src'), key=lambda r: '_VitaTV' in r):  # o normal antes do PS TV
                args += ['--wad', '%s=%s' % (rel, os.path.join(m.dir, 'src', *rel.split('/')))]
            run(py + [ps, '-', '--modlist', modlist, '--files-out', tmp] + args + lang, log)
            for rel in BASE_FILES:
                src = os.path.join(tmp, *rel.split('/'))
                if os.path.exists(src) and (rel in m.files('src') or rel.replace('wad/_VitaTV/', 'wad/') in m.files('src')):
                    dst = os.path.join(m.dir, 'files', *rel.split('/'))
                    os.makedirs(os.path.dirname(dst), exist_ok=True)
                    shutil.copyfile(src, dst)
            shutil.rmtree(tmp, ignore_errors=True)
    for m in mods:
        ps = psarc_path(cfg, m.game)
        if not os.path.exists(ps):
            continue
        names = manifest(ps)
        lines = []
        for rel in m.files('files'):
            if rel in names:
                lines.append('%s\t%d\tfiles/%s' % (PSARC[m.game], names.index(rel) + 1, rel))
            else:
                log('aviso: %s não existe no %s (ignorado)' % (rel, PSARC[m.game]))
        open(os.path.join(m.dir, 'entries.tsv'), 'w', encoding='utf-8', newline='\n').write('\n'.join(lines) + '\n')
        log('%s: %d arquivos em entries.tsv' % (m.id, len(lines)))
    log('pronto: %d mods' % len(mods))


# ------------------------------------------------------------------ conversão de mods do PS2
def convert_ps2(cfg, game, patch, iso, mid, name, author='', description='', log=print, keep_work=False):
    """Mod de PS2 distribuído como xdelta (solto ou dentro de um .zip) -> mod do vitart, instalado e com rebuild.
    iso: a ISO original do PS2 (.iso, ou o .7z que a contém). Só o GoW2 por enquanto."""
    if game != 'gow2':
        raise ValueError('a conversão de mods do PS2 ainda só existe para o GoW2 (docs/modding/README.md)')
    for k in ('xdelta3',):
        if not os.path.exists(cfg[k]):
            raise FileNotFoundError('%s não encontrado em %s (configure em Configurações)' % (k, cfg[k]))
    work = os.path.join(cfg['work'], safe_id(mid))
    os.makedirs(work, exist_ok=True)
    py = [cfg['python'], '-P']
    try:
        if iso.lower().endswith('.7z'):
            log('== extraindo a ISO do .7z (temporária)')
            run([cfg['sevenzip'], 'e', '-y', '-o' + os.path.join(work, 'iso'), iso, '*.iso'], log)
            iso = next(os.path.join(work, 'iso', f) for f in os.listdir(os.path.join(work, 'iso')) if f.lower().endswith('.iso'))
        ps2 = os.path.join(work, 'ps2')
        log('== aplicando o patch (fluxo, só os arquivos que mudam)')
        run(py + [os.path.join(TOOLS, 'ps2_xdelta_wads.py'), cfg['xdelta3'], patch, iso, ps2], log)
        log('== originais dos WADs mudados')
        import texpack_ps2
        os.makedirs(os.path.join(ps2, 'orig'), exist_ok=True)
        changed = [l.split('\t')[0] for l in open(os.path.join(ps2, 'mudados.tsv'))]
        with open(iso, 'rb') as f:
            toc = texpack_ps2.toc_any(f)
            for n in changed:
                if n.upper().endswith('.WAD') and n in toc:
                    size, sec = toc[n]
                    f.seek(sec * 2048)
                    open(os.path.join(ps2, 'orig', n), 'wb').write(f.read(size))
        for n in changed:  # vídeos e outros arquivos do PS2 não servem ao Vita
            if not n.upper().endswith('.WAD'):
                try:
                    os.remove(os.path.join(ps2, n))
                except OSError:
                    pass
        vita = os.path.join(work, 'vita')
        log('== convertendo os WADs para o formato do Vita')
        run(py + [os.path.join(TOOLS, 'gow2_mod_wad.py'), '--all', ps2, psarc_path(cfg, game), vita], log)
        files = {}
        for line in open(os.path.join(vita, 'wad_args.txt'), encoding='utf-8'):
            line = line.strip()
            if line.startswith('--wad '):
                dst, src = line[6:].split('=', 1)
                files[dst] = open(src, 'rb').read()
        mid = install_mod(cfg, mid, name, game, files, author=author, description=description, log=log)
        rebuild(cfg, log)
        return mid
    finally:
        if not keep_work:
            shutil.rmtree(work, ignore_errors=True)


def wad_variants(wad):
    """O WAD normal e o do PS TV (wad/_VitaTV/, o que o vitart carrega)."""
    base = wad.replace('wad/_VitaTV/', 'wad/', 1)
    return (base, base.replace('wad/', 'wad/_VitaTV/', 1))


def make_texture_mod(cfg, mid, name, game, changes, author='', description='', log=print):
    """changes: [(wad no psarc, registro '~...', RGBA)]. A troca vale nas duas versões do WAD (normal e _VitaTV)."""
    import numpy as np  # noqa: F401
    ps = psarc_path(cfg, game)
    names = manifest(ps)
    out = {}
    for wad, rec, rgba in changes:
        for variant in wad_variants(wad):
            if variant not in names:
                continue
            body = out.get(variant) or read_psarc_file(ps, variant)
            try:
                out[variant] = replace_texture(body, game, rec, rgba)
            except KeyError:
                log('%s: sem o registro %s (fica como está)' % (variant, rec))
    mid = install_mod(cfg, mid, name, game, out, author=author, description=description, log=log)
    rebuild(cfg, log)
    return mid


# ------------------------------------------------------------------ mods de texto (tradução)
TEXT_WAD = 'wad/_VitaTV/r_perma.wad_psp2'  # os textos que o vitart mostra (o modo PS TV)
# registro com o texto: o GoW1 (só inglês) guarda em msgs_en.txt, sem MSGS_COUNT/MSGS_LINES; o GoW2 em MSGS_TXT
TEXT_REC = {'gow1': 'msgs_en.txt', 'gow2': 'MSGS_TXT'}


def text_body(cfg, game, wad=TEXT_WAD):
    """O texto do jogo (o registro de TEXT_REC, até o primeiro zero)."""
    recs = wad_records(read_psarc_file(psarc_path(cfg, game), wad), game)
    rec = next((r for r in recs if r[2] == TEXT_REC[game]), None)
    if rec is None:
        raise ValueError('%s não tem %s' % (wad, TEXT_REC[game]))
    return rec[3].split(b'\0')[0]
# A fonte do HUD é a mesma nos dois jogos (FLP_HUD do GoW1, FLP_HUDA/HUDF/HUDS do GoW2: 132 glifos, o mesmo mapa
# caractere -> glifo). Ela tem o latino da Europa Ocidental, mas os glifos 87..95 e 100..106 (À Á Â Ä Ç È É Ê Ë Ñ Ò
# Ó Ô Ö Ù Ú) são os ícones dos botões no Vita (tools/kbm_atlas.py CELLS; medido: Á Â Ä Ç É Ê Ó Ô Ú saem ícones). Não
# tem ã/õ/œ nem as aspas tipográficas. FONT_OK é o que sai como letra.
FONT_OK = set(chr(c) for c in range(0x20, 0x7f)) | set('¡©®°¿ÌÍÎÏÛÜßàáâäçèéêëìíîïñòóôöùúûü')
_FONT_FIX = {'À': 'A', 'Á': 'A', 'Â': 'A', 'Ä': 'A', 'Ã': 'A', 'Ç': 'C', 'È': 'E', 'É': 'E', 'Ê': 'E', 'Ë': 'E',
             'Ñ': 'N', 'Ò': 'O', 'Ó': 'O', 'Ô': 'O', 'Ö': 'O', 'Õ': 'O', 'Ù': 'U', 'Ú': 'U', 'ã': 'ä', 'õ': 'ö',
             'œ': 'oe', 'Œ': 'OE', '': 'oe', '': 'OE', 'æ': 'ae', 'Æ': 'AE', '«': '"', '»': '"', '“': '"', '”': '"', '„': '"', '‘': "'",
             '’': "'", '‚': "'", '…': '...', '–': '-', '—': '-', ' ': ' ', ' ': ' ', '﻿': ''}
# por idioma, quando a letra sem acento muda a palavra: alemão escreve Ä/Ö como Ae/Oe; o italiano "È" (é) vira "E'"
_FONT_FIX_LANG = {'de': {'Ä': 'Ae', 'Ö': 'Oe'}, 'it': {'È': "E'"}}


def font_fix(text, lang=''):
    """Troca o que a fonte do jogo não mostra como letra (ver FONT_OK) pelo mais próximo; devolve (texto, trocas,
    letras que sobraram sem glifo)."""
    import unicodedata
    tab = dict(_FONT_FIX, **_FONT_FIX_LANG.get(lang.split('-')[0], {}))
    out, n, faltam = [], 0, set()
    for ch in text:
        if ch in '\r\n\t' or ch in FONT_OK:
            out.append(ch)
            continue
        troca = tab.get(ch)
        if troca is None:  # sem troca conhecida: a letra sem o acento (decomposição), ou some
            base = ''.join(c for c in unicodedata.normalize('NFKD', ch) if not unicodedata.combining(c))
            troca = base if base and all(c in FONT_OK for c in base) else ''
            faltam.add(ch)
        out.append(troca)
        n += 1
    return ''.join(out), n, faltam


def msgs_need(text):
    """(mensagens, linhas) que o jogo conta ao ler MSGS_TXT (0x81019f7e no GoW2): strtok por CR/LF, pula linhas
    vazias e '//', '*N*' (ou '*N*H'/'*N*T') abre uma mensagem; MSGS_COUNT e MSGS_LINES dimensionam as tabelas."""
    text = text.split(b'\0')[0]
    if text[:3] == b'\xef\xbb\xbf':
        text = text[3:]
    count = lines = 0
    pending = False
    for t in re.split(rb'[\r\n]+', text):
        if not t or t.startswith(b'//'):
            continue
        if t.startswith(b'*') and (t.endswith(b'*') or (len(t) > 2 and t[-2:-1] == b'*' and t[-1:] in b'HT')):
            pending = True
            continue
        if pending:
            count, pending = count + 1, False
        lines += 1
    return count, lines


def text_records(cfg, game, text, rel, wad=TEXT_WAD, lang='', log=print, fix=True, rec_txt=None):
    """(corpo do registro, linhas do records.tsv, mensagens, linhas) para trocar o texto de um jogo por `text`
    (formato MSGS_TXT, str). `rel` é o caminho do corpo dentro da pasta de quem usa. fix=False: o texto já está
    nas letras da fonte do jogo (o oficial)."""
    ps = psarc_path(cfg, game)
    names = manifest(ps)
    if wad not in names:
        raise ValueError('%s não existe no %s' % (wad, PSARC[game]))
    fixed, n, faltam = font_fix(text.lstrip('﻿'), lang) if fix else (text.lstrip('﻿'), 0, ())
    if n:
        log('%s: %d letras trocadas por outras que a fonte do jogo tem%s' % (
            game, n, (' (sem glifo: %s)' % ' '.join(sorted(faltam))) if faltam else ''))
    body = re.sub(rb'\r?\n', b'\r\n', fixed.encode('utf-8').rstrip(b'\0'))
    if not body.endswith(b'\r\n'):
        body += b'\r\n'
    body += b'\0\0'  # o jogo percorre o texto com strtok: precisa do zero no fim
    rec_txt = rec_txt or TEXT_REC[game]
    recs = {r[2]: r for r in wad_records(read_psarc_file(ps, wad), game) if r[2].startswith('MSGS_') or r[2] == rec_txt}
    if rec_txt not in recs:
        raise ValueError('%s não tem %s' % (wad, rec_txt))
    count, lines = msgs_need(body)
    if 'MSGS_COUNT' in recs:
        count, lines = max(count, recs['MSGS_COUNT'][5]), max(lines, recs['MSGS_LINES'][5])
    idx = names.index(wad) + 1
    rows = ['%s\t%d\t%d\t%s\t0\t%s' % (PSARC[game], idx, recs[rec_txt][0], rec_txt, rel)]
    if 'MSGS_COUNT' in recs:  # o GoW2 dimensiona as tabelas por esses dois; o GoW1 não tem
        rows += ['%s\t%d\t%d\tMSGS_COUNT\t0\t=%d' % (PSARC[game], idx, recs['MSGS_COUNT'][0], count),
                 '%s\t%d\t%d\tMSGS_LINES\t0\t=%d' % (PSARC[game], idx, recs['MSGS_LINES'][0], lines)]
    return body, rows, count, lines


def make_text_mod(cfg, mid, name, game, txt_path, wad=TEXT_WAD, author='', description='', log=print):
    """O .txt traduzido (formato do MSGS_TXT: '*N*' e as linhas da mensagem, UTF-8) vira uma tradução do Settings
    (Idioma do jogo), não um mod: assim só uma fica ligada. Vale ao abrir o jogo (o r_perma só é lido aí)."""
    code = safe_id(mid).replace('_', '-')
    d = os.path.join(trad_dir(cfg), code)
    os.makedirs(os.path.join(d, 'fontes'), exist_ok=True)
    raw = open(txt_path, 'rb').read()
    raw.decode('utf-8')  # o jogo lê UTF-8: falha cedo se o arquivo for outra codificação
    open(os.path.join(d, 'fontes', '%s.txt' % game), 'wb').write(raw)
    ini = _trad_ini(d)
    ini['name'] = ini.get('name') or name
    ini['author_' + game] = author
    _trad_ini_write(d, ini)
    build_translation(cfg, code, log)
    log('tradução "%s" (%s) instalada: escolha em Settings > Idioma do jogo' % (name, code))
    return code


# ------------------------------------------------------------------ traduções (Settings > Idioma do jogo)
# <data>/traducoes/<código>/: idioma.ini (name=, author_gow1=, author_gow2=), fontes/<jogo>.txt (o texto traduzido) ou,
# para o texto oficial que o próprio jogo traz, fontes/<jogo>_extra.txt (só as mensagens que faltam nele). O
# build_translation gera records/<jogo>.txt e records.tsv (formato dos mods de registro); o vitart aplica a de
# language=<código> do vitart_options.ini (runtime/vitart/hle_io.cpp). Uma só: nunca duas traduções ligadas.
IDIOMAS = [('pt-BR', 'Português (Brasil)'), ('es', 'Español'), ('fr', 'Français'), ('it', 'Italiano'),
           ('de', 'Deutsch')]
# os dois jogos americanos trazem o francês e o espanhol oficiais, completos (menus, HUD e mensagens): com
# language=fr ou es o vitart dá ao jogo esse idioma de sistema e ele mesmo os carrega (runtime/vitart/hle_sys.cpp). São
# do jogo de quem joga, não vêm com o projeto. Só o texto do GoW2 tem buracos (mensagens 36-45, o _extra.txt), e o
# complemento vai para o próprio WAD oficial, que é o que o jogo lê nesse idioma. O do GoW1 está completo (latin-1).
OFICIAL = {('gow1', 'fr'): ('wad/_VitaTV/r_permf.wad_psp2', 'msgsF.txt'),
           ('gow1', 'es'): ('wad/_VitaTV/r_perms.wad_psp2', 'msgsS.txt'),
           ('gow2', 'fr'): ('wad/_VitaTV/r_plocf.wad_psp2', 'MSGS_TXT'),
           ('gow2', 'es'): ('wad/_VitaTV/r_plocs.wad_psp2', 'MSGS_TXT')}
_MSG = re.compile(r'^\*(\d+)\*[HT]?\s*$')


def trad_dir(cfg):
    return os.path.join(cfg['data'], 'traducoes')


def _trad_ini(d):
    out = {}
    p = os.path.join(d, 'idioma.ini')
    if os.path.exists(p):
        for line in open(p, encoding='utf-8'):
            k, eq, v = line.rstrip('\r\n').partition('=')
            if eq and not k.startswith('#'):
                out[k.strip()] = v.strip()
    return out


def _trad_ini_write(d, ini):
    lines = ['# Tradução do vitart (Settings > Idioma do jogo)'] + ['%s=%s' % kv for kv in ini.items()]
    open(os.path.join(d, 'idioma.ini'), 'w', encoding='utf-8', newline='\n').write('\n'.join(lines) + '\n')


def translation_source(cfg, code, game):
    """(texto, WAD, registro, corrigir a fonte) de um jogo nessa tradução, ou None se não houver o que trocar. No
    oficial, o texto do jogo mais as mensagens que faltam nele (as do _extra.txt, já nas letras da fonte); sem
    _extra.txt, nada: o jogo já traz tudo."""
    d = os.path.join(trad_dir(cfg), code, 'fontes')
    p = os.path.join(d, game + '.txt')
    extra = os.path.join(d, game + '_extra.txt')
    oficial = OFICIAL.get((game, code))
    if not oficial:
        return (open(p, 'rb').read().decode('utf-8'), TEXT_WAD, TEXT_REC[game], True) if os.path.exists(p) else None
    wad, rec_txt = oficial
    if not os.path.exists(extra) or not os.path.exists(psarc_path(cfg, game)):
        return None
    recs = wad_records(read_psarc_file(psarc_path(cfg, game), wad), game)
    rec = next((r for r in recs if r[2] == rec_txt), None)
    if rec is None:
        return None
    text = bytes(rec[3]).split(b'\0')[0].decode('utf-8').rstrip('\r\n') + '\r\n'
    if True:  # só as mensagens que o oficial não tem (o número de cada uma não muda)
        tem = {m.group(1) for m in map(_MSG.match, text.splitlines()) if m}
        bloco, manter = [], False
        for line in open(extra, 'rb').read().decode('utf-8').splitlines():
            m = _MSG.match(line)
            if m:
                manter = m.group(1) not in tem
            if manter:
                bloco.append(line)
        text += font_fix('\r\n'.join(bloco), code)[0] + '\r\n'
    return text, wad, rec_txt, False


def build_translation(cfg, code, log=print):
    """Gera records/ e records.tsv de <data>/traducoes/<código> a partir das fontes (e do jogo, no oficial)."""
    d = os.path.join(trad_dir(cfg), code)
    if not os.path.isdir(d):
        raise ValueError('tradução não encontrada: %s' % code)
    rows, feitos = [], []
    os.makedirs(os.path.join(d, 'records'), exist_ok=True)
    for game in ('gow1', 'gow2'):
        if not os.path.exists(psarc_path(cfg, game)):
            continue
        src = translation_source(cfg, code, game)
        if src is None:
            if (game, code) in OFICIAL:
                feitos.append(game)
                log('%s %s: o texto oficial do jogo, completo' % (code, game))
            continue
        text, wad, rec_txt, fix = src
        rel = 'records/%s.txt' % game
        body, r, count, lines = text_records(cfg, game, text, rel, wad=wad, lang=code, log=log, fix=fix,
                                             rec_txt=rec_txt)
        open(os.path.join(d, rel), 'wb').write(body)
        rows += r
        feitos.append(game)
        log('%s %s: %d mensagens, %d linhas' % (code, game, count, lines))
    open(os.path.join(d, 'records.tsv'), 'w', encoding='utf-8', newline='\n').write('\n'.join(rows) + '\n')
    return feitos


def list_translations(cfg):
    """[{codigo, nome, jogos, autores}] das traduções em <data>/traducoes, na ordem de IDIOMAS e depois as outras."""
    root = trad_dir(cfg)
    codes = [c for c in sorted(os.listdir(root)) if os.path.isdir(os.path.join(root, c))] if os.path.isdir(root) else []
    ordem = [c for c, _ in IDIOMAS if c in codes] + [c for c in codes if c not in dict(IDIOMAS)]
    out = []
    for c in ordem:
        d = os.path.join(root, c)
        ini = _trad_ini(d)
        jogos = [g for g in ('gow1', 'gow2') if os.path.exists(os.path.join(d, 'fontes', g + '.txt')) or (g, c) in OFICIAL]
        if not jogos:
            continue
        out.append({'codigo': c, 'nome': ini.get('name') or dict(IDIOMAS).get(c, c), 'jogos': jogos,
                    'autores': {g: ini.get('author_' + g, '') for g in jogos}})
    return out


def get_language(cfg):
    if os.path.exists(ini_path(cfg)):
        for line in open(ini_path(cfg), encoding='utf-8', errors='replace'):
            if line.startswith('language='):
                return line.strip().split('=', 1)[1]
    return ''


def set_language(cfg, code, log=print):
    """language=<código> no vitart_options.ini (vazio = o texto original); gera a tradução antes de ligar."""
    if code:
        build_translation(cfg, code, log)
    lines = open(ini_path(cfg), encoding='utf-8', errors='replace').read().splitlines() if os.path.exists(ini_path(cfg)) else []
    lines = [l for l in lines if not l.startswith('language=')] + (['language=' + code] if code else [])
    open(ini_path(cfg), 'w', encoding='utf-8', newline='\n').write('\n'.join(lines) + '\n')
    return code


def is_text_mod(m):
    """Mod só de texto (tradução de antes do Idioma do jogo): records.tsv só com os registros de texto."""
    p = os.path.join(m.dir, 'records.tsv')
    if not os.path.exists(p) or m.files() or m.files('src'):
        return False
    nomes = [l.split('\t')[3] for l in open(p, encoding='utf-8').read().splitlines() if l.count('\t') >= 5]
    return bool(nomes) and all(n.startswith('MSGS_') or n in TEXT_REC.values() for n in nomes)


def migrate_text_mods(cfg, log=print):
    """Tira as traduções da lista de mods (vão para mods_removidos, nada é apagado) e refaz o menu de mods do jogo."""
    import time
    movidos = []
    for m in list_mods(cfg):
        if not is_text_mod(m):
            continue
        dst = os.path.join(cfg['data'], 'mods_removidos', '%s_%s' % (m.id, time.strftime('%Y%m%d_%H%M%S')))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.move(m.dir, dst)
        lines = open(ini_path(cfg), encoding='utf-8', errors='replace').read().splitlines() if os.path.exists(ini_path(cfg)) else []
        open(ini_path(cfg), 'w', encoding='utf-8', newline='\n').write(
            '\n'.join(l for l in lines if not l.startswith('mod_%s=' % m.id)) + '\n')
        movidos.append((m.id, m.name, m.game, dst))
        log('tradução "%s" (%s) saiu dos mods: %s' % (m.name, m.game, dst))
    if movidos:
        rebuild(cfg, log)
    return movidos


# ------------------------------------------------------------------ linha de comando
def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    cfg = load_config()
    a = sys.argv[1:]
    if not a or a[0] == 'list':
        for m in list_mods(cfg):
            print('[%s] %-20s %-6s %s (%d arquivos, %.1f MB)' % ('x' if m.enabled else ' ', m.id, m.game, m.name,
                                                              len(m.files()), m.size() / 1e6))
    elif a[0] in ('enable', 'disable'):
        set_enabled(cfg, a[1], a[0] == 'enable')
    elif a[0] == 'rebuild':
        rebuild(cfg)
    elif a[0] == 'convert-ps2':
        author = a[a.index('--author') + 1] if '--author' in a else ''
        convert_ps2(cfg, a[1], a[2], a[3], a[4], a[5], author=author)
    elif a[0] == 'textures':
        for t in wad_textures(read_psarc_file(psarc_path(cfg, a[1]), a[2]), a[1]):
            print('%-24s %4dx%-4d %s' % t)
    elif a[0] == 'export-tex':
        from PIL import Image
        Image.fromarray(texture_rgba(read_psarc_file(psarc_path(cfg, a[1]), a[2]), a[1], a[3])).save(a[4])
    elif a[0] == 'texture-mod':
        import numpy as np
        from PIL import Image
        game, mid, name = a[1], a[2], a[3]
        changes = []
        for spec in a[4:]:
            wad, rec, png = spec.split('=', 2)
            changes.append((wad, rec, np.array(Image.open(png).convert('RGBA'))))
        make_texture_mod(cfg, mid, name, game, changes)
    elif a[0] == 'translations':
        for t in list_translations(cfg):
            print('%-8s %-22s %s' % (t['codigo'], t['nome'], ' '.join(t['jogos'])))
        print('ligada:', get_language(cfg) or '(original)')
    elif a[0] == 'build-translation':
        build_translation(cfg, a[1])
    elif a[0] == 'language':
        set_language(cfg, a[1] if len(a) > 1 else '')
    elif a[0] == 'migrate-text-mods':
        migrate_text_mods(cfg)
    elif a[0] == 'text-mod':
        wad = a[a.index('--wad') + 1] if '--wad' in a else TEXT_WAD
        make_text_mod(cfg, a[2], a[3], a[1], a[4], wad=wad)
    else:
        print(__doc__)


if __name__ == '__main__':
    main()
