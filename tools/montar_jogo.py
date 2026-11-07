"""Monta a pasta do God of War Collection com cara de jogo de PC: um exe com ícone na raiz e o resto em subpastas.

    python tools/montar_jogo.py <destino> [--vitart vitart.exe] [--rt pasta_rt] [--sem-mods]

    God of War Collection.exe   o vitart com ícone e versão; sem argumentos acha tudo ao lado (core.cpp)
    bin\\       DLLs do jogo recompilado, link.hlevars.txt, ffmpeg.exe
    game\\      PCSA00126 (o app do Vita, instalado do PKG)
    data\\      o vitart-data (texturas HD, PBR, áudio do PS2, vídeos, mods, saves, troféus)
    shaders\\   o cache de shaders
    Ferramentas\\  vitart Troféus e Mod Studio (Electron) e as ferramentas em Python que eles usam
    logs\\      o registro do jogo

Tudo vira hard link (mesmo disco, não ocupa espaço de novo), menos o que o jogo e o Mod Studio reescrevem (opções,
saves, troféus, mods), que é copiado, para a pasta nova não mexer na antiga. Os backups "*.antes_*" ficam de
fora.
"""
import argparse
import io
import os
import shutil
import struct
import subprocess
import sys
import tempfile

TOOLS = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(TOOLS)
sys.path.insert(0, TOOLS)

NOME = 'God of War Collection'
# o que o jogo ou o Mod Studio reescrevem no lugar: cópia (num hard link a escrita mudaria a pasta antiga também)
MUTAVEIS = ('vitart_options.ini', 'pbr.ini', 'trophy/', 'savedata', 'mods/')
LLVM = r'C:\Program Files\LLVM\bin'


def link_ou_copia(src, dst, copiar=False):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if os.path.exists(dst):
        os.remove(dst)  # a cópia da rodada anterior, feita por este script
    if not copiar:
        try:
            os.link(src, dst)
            return 'link'
        except OSError:
            pass  # outro disco: copia
    shutil.copy2(src, dst)
    return 'copia'


def espelhar(src, dst, pular=lambda rel: False, copiar=lambda rel: False):
    """copiar(rel): arquivo que quem joga muda (opções, saves, troféus, mods). Só entra se ainda não existe no destino:
    rodar de novo não pode apagar o progresso de quem já joga na pasta."""
    n = {'link': 0, 'copia': 0, 'mantido': 0}
    for d, _dirs, fs in os.walk(src):
        for f in fs:
            s = os.path.join(d, f)
            rel = os.path.relpath(s, src)
            r = rel.replace('\\', '/')
            if pular(r):
                continue
            if copiar(r) and os.path.exists(os.path.join(dst, rel)):
                n['mantido'] += 1
                continue
            n[link_ou_copia(s, os.path.join(dst, rel), copiar(r))] += 1
    return n


# ------------------------------------------------------------------ recursos do exe (ícone e versão)
RC = '''1 ICON "{ico}"
1 VERSIONINFO
FILEVERSION 1,0,0,0
PRODUCTVERSION 1,0,0,0
FILEOS 0x40004
FILETYPE 0x1
BEGIN
  BLOCK "StringFileInfo"
  BEGIN
    BLOCK "041604B0"
    BEGIN
      VALUE "CompanyName", "vitart (recompilação não oficial)"
      VALUE "FileDescription", "{nome}"
      VALUE "FileVersion", "1.0.0.0"
      VALUE "InternalName", "vitart"
      VALUE "OriginalFilename", "{nome}.exe"
      VALUE "ProductName", "{nome}"
      VALUE "ProductVersion", "1.0"
    END
  END
  BLOCK "VarFileInfo"
  BEGIN
    VALUE "Translation", 0x416, 1200
  END
END
'''


def ler_res(blob):
    """Entradas de um .res: [(tipo, nome, idioma, dados)]; tipo e nome são int ou str."""
    out, p = [], 0

    def ident(q):
        if struct.unpack_from('<H', blob, q)[0] == 0xFFFF:
            return struct.unpack_from('<H', blob, q + 2)[0], q + 4
        e = q
        while struct.unpack_from('<H', blob, e)[0]:
            e += 2
        return blob[q:e].decode('utf-16-le'), e + 2
    while p + 8 <= len(blob):
        dsize, hsize = struct.unpack_from('<II', blob, p)
        typ, q = ident(p + 8)
        name, q = ident(q)
        q = (q + 3) & ~3
        _dv, _mf, lang = struct.unpack_from('<IHH', blob, q)
        data = blob[p + hsize:p + hsize + dsize]
        if dsize:
            out.append((typ, name, lang, data))
        p = (p + hsize + dsize + 3) & ~3
    return out


def aplicar_res(exe, res_path):
    import ctypes
    from ctypes import wintypes
    k32 = ctypes.WinDLL('kernel32', use_last_error=True)
    k32.BeginUpdateResourceW.restype = wintypes.HANDLE
    k32.BeginUpdateResourceW.argtypes = [wintypes.LPCWSTR, wintypes.BOOL]
    k32.UpdateResourceW.argtypes = [wintypes.HANDLE, wintypes.LPVOID, wintypes.LPVOID, wintypes.WORD, wintypes.LPVOID, wintypes.DWORD]
    k32.EndUpdateResourceW.argtypes = [wintypes.HANDLE, wintypes.BOOL]
    h = k32.BeginUpdateResourceW(exe, False)
    if not h:
        raise ctypes.WinError(ctypes.get_last_error())
    keep = []
    for typ, name, lang, data in ler_res(open(res_path, 'rb').read()):
        t = ctypes.c_void_p(typ) if isinstance(typ, int) else ctypes.c_wchar_p(typ)
        n = ctypes.c_void_p(name) if isinstance(name, int) else ctypes.c_wchar_p(name)
        buf = ctypes.create_string_buffer(data, len(data))
        keep.append(buf)
        if not k32.UpdateResourceW(h, t, n, lang, buf, len(data)):
            raise ctypes.WinError(ctypes.get_last_error())
    if not k32.EndUpdateResourceW(h, False):
        raise ctypes.WinError(ctypes.get_last_error())


def icone_ico(png, destino):
    """Ícone quadrado com cantos levemente arredondados, de 16 a 256 px."""
    from PIL import Image, ImageDraw
    im = Image.open(png).convert('RGBA')
    s = min(im.size)
    im = im.crop(((im.width - s) // 2, (im.height - s) // 2, (im.width + s) // 2, (im.height + s) // 2)).resize((256, 256), Image.LANCZOS)
    m = Image.new('L', (256, 256), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, 255, 255], radius=36, fill=255)
    im.putalpha(Image.composite(im.getchannel('A'), m, m))
    im.save(destino, 'ICO', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])


def settings_exe(ico, destino):
    """Settings.exe na raiz: um lançador nativo do vitart Settings (apps/vitart-ui/settings_lancador.cpp)."""
    tmp = tempfile.mkdtemp(prefix='vitart_set_')
    obj = os.path.join(tmp, 'Settings.exe')
    subprocess.run([os.path.join(LLVM, 'clang++.exe'), '-std=c++20', '-O2', '-municode',
                    os.path.join(REPO, 'apps', 'vitart-ui', 'settings_lancador.cpp'), '-o', obj,
                    '-Xlinker', '/SUBSYSTEM:WINDOWS', '-luser32'], check=True)
    rc = os.path.join(tmp, 's.rc')
    open(rc, 'w', encoding='utf-8').write(RC.format(ico=ico.replace('\\', '\\\\'), nome='Settings'))
    res = os.path.join(tmp, 's.res')
    subprocess.run([os.path.join(LLVM, 'llvm-rc.exe'), '/C', '65001', '/FO', res, rc], check=True)
    aplicar_res(obj, res)
    if os.path.exists(destino):
        os.remove(destino)  # o da rodada anterior, gerado aqui
    shutil.copy2(obj, destino)


def exe_do_jogo(vitart, ico, destino):
    tmp = tempfile.mkdtemp(prefix='vitart_rc_')
    rc = os.path.join(tmp, 'jogo.rc')
    open(rc, 'w', encoding='utf-8').write(RC.format(ico=ico.replace('\\', '\\\\'), nome=NOME))
    res = os.path.join(tmp, 'jogo.res')
    subprocess.run([os.path.join(LLVM, 'llvm-rc.exe'), '/C', '65001', '/FO', res, rc], check=True)
    if os.path.exists(destino):
        os.remove(destino)  # o exe da rodada anterior
    shutil.copy2(vitart, destino)
    aplicar_res(destino, res)


LEIA_ME = '''God of War Collection (PS Vita) no PC
=====================================

Para jogar: abra "God of War Collection.exe".

O jogo é o God of War Collection do PS Vita (PCSA00126) recompilado para rodar direto no Windows, sem emulador,
sobre o runtime vitart. Precisa de uma placa de vídeo com Vulkan; sem Vulkan, ele usa o Direct3D 11 sozinho.

Pastas
  bin\\          o jogo recompilado (DLLs) e o ffmpeg dos vídeos
  game\\         os arquivos do jogo, vindos do PKG do Vita
  data\\         texturas HD, PBR, áudio do PS2, vídeos remasterizados, mods, saves e troféus
  shaders\\      cache de shaders
  Ferramentas\\  vitart Troféus, vitart Mod Studio e vitart Settings (trazem o próprio Python, não precisa instalar)
  logs\\         registro da última sessão (logs\\vitart.log), útil se algo der errado

Settings.exe: a API de vídeo (Automático, Vulkan ou Direct3D 11) e o mapa completo de teclado e mouse.
Opções do PC (resolução, FPS, mods, barras de vida...): no jogo, menu de pausa > Options.
Seus saves e troféus ficam em data\\.
'''


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('destino')
    ap.add_argument('--vitart', help='vitart.exe compilado (padrão: <rt>/vitart.exe)')
    ap.add_argument('--rt', default=os.path.join(REPO, '..', 'gow-dump', 'rt'))
    ap.add_argument('--sem-mods', action='store_true', help='não leva os mods de terceiros (só o patch do menu)')
    a = ap.parse_args()
    import vitart_modkit as K
    cfg = K.load_config()
    rt = os.path.abspath(a.rt)
    dst = os.path.abspath(a.destino)
    os.makedirs(dst, exist_ok=True)

    print('== bin')
    for f in ('eboot.dll', 'gow1.dll', 'gow2.dll', 'libc.dll', 'libfios2.dll', 'link.hlevars.txt', 'ffmpeg.exe'):
        link_ou_copia(os.path.join(rt, f), os.path.join(dst, 'bin', f))

    print('== game (app do Vita)')
    print('  ', espelhar(cfg['app'], os.path.join(dst, 'game', 'PCSA00126')))

    print('== data')
    terceiros = set()
    if a.sem_mods:
        terceiros = {m.id for m in K.list_mods(cfg)}

    def pular_data(rel):
        if '.antes_' in rel or rel.startswith('modkit_work/') or rel.startswith('mods_removidos/'):
            return True
        return any(rel.startswith('mods/%s/' % t) for t in terceiros)
    print('  ', espelhar(cfg['data'], os.path.join(dst, 'data'), pular_data, lambda rel: rel.startswith(MUTAVEIS)))
    if a.sem_mods:  # sem os mods, a lista e as opções não podem apontar para eles
        lst = os.path.join(dst, 'data', 'mods', 'modlist.tsv')
        if os.path.exists(lst):
            open(lst, 'w', encoding='utf-8').write('')
        ini = os.path.join(dst, 'data', 'vitart_options.ini')
        if os.path.exists(ini):
            linhas = [l for l in open(ini, encoding='utf-8', errors='replace').read().splitlines() if not l.startswith('mod_')]
            open(ini, 'w', encoding='utf-8', newline='\n').write('\n'.join(linhas) + '\n')

    print('== shaders')
    print('  ', espelhar(os.path.join(rt, 'spv'), os.path.join(dst, 'shaders')))

    print('== exe do jogo')
    tmp = tempfile.mkdtemp(prefix='vitart_ico_')
    ico = os.path.join(tmp, 'jogo.ico')
    fonte = os.path.join(cfg['data'], 'ui-arte', 'icone.png')
    icone_ico(fonte if os.path.exists(fonte) else os.path.join(cfg['app'], 'sce_sys', 'icon0.png'), ico)
    exe_do_jogo(os.path.abspath(a.vitart or os.path.join(rt, 'vitart.exe')), ico, os.path.join(dst, NOME + '.exe'))
    os.makedirs(os.path.join(dst, 'logs'), exist_ok=True)

    print('== Ferramentas')
    fer = os.path.join(dst, 'Ferramentas')
    ui_src = os.path.join(rt, 'vitart-ui')
    print('  ', espelhar(ui_src, os.path.join(fer, 'vitart-ui'), lambda rel: rel.startswith('resources/app/')))
    app = os.path.join(fer, 'vitart-ui', 'resources', 'app')
    if os.path.isdir(app):
        shutil.rmtree(app)  # a cópia anterior, gerada aqui
    os.makedirs(app)
    for f in ('main.js', 'preload.js', 'package.json'):
        shutil.copy2(os.path.join(REPO, 'apps', 'vitart-ui', f), app)
    shutil.copytree(os.path.join(REPO, 'apps', 'vitart-ui', 'renderer'), os.path.join(app, 'renderer'))
    shutil.copy2(ico, os.path.join(app, 'vitart.ico'))
    open(os.path.join(app, 'repo.json'), 'w', encoding='utf-8').write('{"relativo": ".."}')
    tdst = os.path.join(fer, 'tools')
    if os.path.isdir(tdst):
        shutil.rmtree(tdst)  # a cópia anterior, gerada aqui
    shutil.copytree(TOOLS, tdst, ignore=shutil.ignore_patterns('__pycache__', 're', 'gxm_replay', 'modkit_config.json', 'build_*.py', 'montar_jogo.py', 'empacotar_instalador*'))
    ddst = os.path.join(fer, 'docs', 'modding')
    if os.path.isdir(ddst):
        shutil.rmtree(ddst)
    shutil.copytree(os.path.join(REPO, 'docs', 'modding'), ddst)
    import python_portatil  # o PC de quem instala pode não ter Python
    python_portatil.montar(os.path.join(fer, 'python'))
    print('== Settings.exe')
    settings_exe(ico, os.path.join(dst, 'Settings.exe'))

    open(os.path.join(dst, 'Leia-me.txt'), 'w', encoding='utf-8-sig', newline='\r\n').write(LEIA_ME)
    print('pronto:', os.path.join(dst, NOME + '.exe'))


if __name__ == '__main__':
    main()
