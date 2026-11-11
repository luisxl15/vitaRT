"""Atalhos na biblioteca da Steam, como o EmuDeck faz com o Steam ROM Manager (Settings › Steam).

    python tools/steam_atalhos.py <pasta do jogo> [--chave-sgdb CHAVE] [--fechar-steam]

Cada jogo (God of War, God of War II) vira um "jogo que não é da Steam", que abre direto com
`God of War Collection.exe gow1|gow2`, com capa vertical, banner, fundo (hero), logo e ícone na pasta grid da Steam.
Ganha a sobreposição, a Steam Input e o modo Big Picture. Conquistas da Steam não existem para atalhos (precisam de um
AppID da loja): os troféus continuam os do vitart, com o aviso na tela.

Arte: com uma chave da SteamGridDB (grátis, steamgriddb.com > Preferences > API), a mesma fonte do Steam ROM Manager;
sem ela, as imagens padrão de cada jogo que vêm com ele (data/ui-arte/steam/<jogo>/sgdb_*, escolhidas na SteamGridDB;
créditos em creditos_steamgriddb.tsv) ou, faltando elas, a arte tirada das texturas do jogo, com o logo por cima.

O shortcuts.vdf é binário (KeyValues): 0x00 abre um mapa, 0x01 é texto, 0x02 é inteiro de 32 bits, 0x08 fecha. A Steam
reescreve o arquivo ao fechar, então ele só é mexido com a Steam fechada. O ID do atalho é o do Steam ROM Manager:
crc32(exe + nome) | 0x80000000; a arte fica em userdata/<usuário>/config/grid/<id>p.png (capa), <id>.png (banner),
<id>_hero.png e <id>_logo.png.
"""
import io
import json
import os
import shutil
import struct
import subprocess
import sys
import time
import urllib.request
import zlib

JOGOS = [('gow1', 'God of War', 2005), ('gow2', 'God of War II', 2007)]
EXE = 'God of War Collection.exe'
UA = 'vitart-settings'
SEM_JANELA = getattr(subprocess, 'CREATE_NO_WINDOW', 0)


# ------------------------------------------------------------------ Steam instalada
def steam_dir():
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r'Software\Valve\Steam') as k:
            p = winreg.QueryValueEx(k, 'SteamPath')[0]
            if os.path.isdir(p):
                return os.path.normpath(p)
    except OSError:
        pass
    for p in (r'C:\Program Files (x86)\Steam', r'C:\Program Files\Steam'):
        if os.path.isdir(p):
            return p
    return None


def usuarios(steam):
    """As contas que já entraram neste PC (userdata/<id>/config)."""
    base = os.path.join(steam, 'userdata')
    if not os.path.isdir(base):
        return []
    return [d for d in sorted(os.listdir(base)) if d.isdigit() and d != '0' and os.path.isdir(os.path.join(base, d, 'config'))]


def steam_aberta():
    try:
        t = subprocess.run(['tasklist', '/fo', 'csv', '/nh'], capture_output=True, text=True, errors='replace',
                           creationflags=SEM_JANELA).stdout.lower()
    except OSError:
        return False
    return '"steam.exe"' in t


def fechar_steam(steam, espera=40):
    subprocess.Popen([os.path.join(steam, 'steam.exe'), '-shutdown'], creationflags=SEM_JANELA)
    fim = time.time() + espera
    while time.time() < fim:
        time.sleep(1)
        if not steam_aberta():
            time.sleep(2)  # termina de gravar os arquivos dela
            return True
    return False


# ------------------------------------------------------------------ shortcuts.vdf (KeyValues binário)
def vdf_ler(b):
    def mapa(i):
        out = {}
        while True:
            t = b[i]
            i += 1
            if t == 0x08:
                return out, i
            j = b.index(b'\0', i)
            k = b[i:j].decode('utf-8', 'replace')
            i = j + 1
            if t == 0x00:
                out[k], i = mapa(i)
            elif t == 0x01:
                j = b.index(b'\0', i)
                out[k] = b[i:j].decode('utf-8', 'replace')
                i = j + 1
            elif t == 0x02:
                out[k] = struct.unpack_from('<i', b, i)[0]
                i += 4
            else:
                raise ValueError('tipo %d desconhecido no shortcuts.vdf' % t)
    if not b:
        return {'shortcuts': {}}
    out, _ = mapa(0)
    return out


def vdf_gravar(d):
    o = io.BytesIO()

    def mapa(m):
        for k, v in m.items():
            kb = str(k).encode('utf-8') + b'\0'
            if isinstance(v, dict):
                o.write(b'\x00' + kb)
                mapa(v)
            elif isinstance(v, int):
                o.write(b'\x02' + kb + struct.pack('<i', v if v < 2 ** 31 else v - 2 ** 32))
            else:
                o.write(b'\x01' + kb + str(v).encode('utf-8') + b'\0')
        o.write(b'\x08')
    mapa(d)
    return o.getvalue()


def id_atalho(exe, nome):
    return (zlib.crc32((exe + nome).encode('utf-8')) & 0xffffffff) | 0x80000000


# ------------------------------------------------------------------ arte
def sgdb(caminho, chave):
    r = urllib.request.Request('https://www.steamgriddb.com/api/v2/' + caminho,
                               headers={'Authorization': 'Bearer ' + chave, 'User-Agent': UA})
    with urllib.request.urlopen(r, timeout=20) as f:
        return json.load(f)


def baixar(url, destino):
    r = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(r, timeout=60) as f, open(destino, 'wb') as o:
        shutil.copyfileobj(f, o)


def arte_sgdb(chave, nome, ano, pasta, log):
    """{tipo: arquivo} baixados da SteamGridDB para o jogo (o de nome igual e ano mais perto)."""
    import urllib.parse
    res = sgdb('search/autocomplete/' + urllib.parse.quote(nome), chave).get('data') or []
    if not res:
        return {}

    def nota(g):
        anos = time.gmtime(g['release_date']).tm_year if g.get('release_date') else 0
        return (g.get('name', '').lower() != nome.lower(), abs(anos - ano) if anos else 99)
    jogo = sorted(res, key=nota)[0]
    log('SteamGridDB: %s -> "%s" (%s)' % (nome, jogo.get('name'), jogo.get('id')))
    feitos = {}
    for tipo, api in (('capa', 'grids/game/%d?dimensions=600x900&types=static'), ('banner', 'grids/game/%d?dimensions=920x430,460x215&types=static'),
                      ('hero', 'heroes/game/%d?types=static'), ('logo', 'logos/game/%d?types=static'), ('icone', 'icons/game/%d?types=static')):
        try:
            itens = sgdb(api % jogo['id'], chave).get('data') or []
        except Exception as e:  # noqa: BLE001
            log('  %s: %s' % (tipo, e))
            continue
        if not itens:
            continue
        url = itens[0]['url']
        dst = os.path.join(pasta, '%s_%s%s' % (jogo['id'], tipo, os.path.splitext(url)[1] or '.png'))
        baixar(url, dst)
        feitos[tipo] = dst
    return feitos


def _logo(p):
    from PIL import Image
    im = Image.open(p).convert('RGBA')
    bb = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    return im.crop(bb) if bb else im


def _cobrir(im, tw, th, ax=0.5, ay=0.5):
    from PIL import Image
    esc = max(tw / im.width, th / im.height)
    im = im.resize((max(tw, round(im.width * esc)), max(th, round(im.height * esc))), Image.LANCZOS)
    x, y = int((im.width - tw) * ax), int((im.height - th) * ay)
    return im.crop((x, y, x + tw, y + th))


def _degrade(im, de_cima, ate, forca=210):
    """Escurece do topo (de_cima) ou da base até a fração `ate` da altura: o logo fica legível sobre a arte."""
    from PIL import Image
    w, h = im.size
    g = Image.new('L', (1, h))
    lim = int(h * ate)
    for y in range(h):
        t = (lim - y) / lim if de_cima else (y - (h - lim)) / lim
        g.putpixel((0, y), int(forca * max(0.0, min(1.0, t))))
    preto = Image.new('RGBA', (w, h), (0, 0, 0, 255))
    preto.putalpha(g.resize((w, h)))
    return Image.alpha_composite(im.convert('RGBA'), preto)


# onde o Kratos está em cada arte (fração do corte na horizontal) para a capa vertical
_CAPA_X = {'gow1': 0.5, 'gow2': 0.78}


def arte_local(jogo_dir, codigo, tmp):
    """Arte do próprio jogo (data/ui-arte/steam/<jogo>: logo, fundo e a base da capa, tiradas das texturas da tela-título
    e do carregamento): capa e banner compostos com o logo. Sem essa pasta, a arte da coletânea."""
    from PIL import Image
    d = os.path.join(jogo_dir, 'data', 'ui-arte', 'steam', codigo)
    icone = os.path.join(jogo_dir, 'data', 'ui-arte', 'icone.png')
    if not all(os.path.exists(os.path.join(d, n)) for n in ('logo.png', 'fundo.png', 'capa_base.png')):
        c = os.path.join(jogo_dir, 'data', 'ui-arte', 'steam')
        pega = lambda n: os.path.join(c, n) if os.path.exists(os.path.join(c, n)) else None
        a = {'capa': pega('capa.png'), 'hero': pega('fundo1.png' if codigo == 'gow1' else 'fundo2.png'),
             'logo': pega('logo.png'), 'icone': icone, 'cortar_capa': 0.085}
        return {k: v for k, v in a.items() if v}
    # as imagens padrão escolhidas na SteamGridDB (sgdb_<tipo>.*), quando vêm com o jogo: as do Big Picture também
    padrao = {}
    for f in os.listdir(d):
        base, ext = os.path.splitext(f)
        if base.startswith('sgdb_') and ext.lower() in ('.png', '.jpg', '.jpeg', '.ico', '.webp'):
            padrao[base[5:]] = os.path.join(d, f)
    if {'capa', 'banner', 'hero', 'logo'} <= set(padrao):
        padrao.setdefault('icone', icone)
        return padrao
    logo = _logo(os.path.join(d, 'logo.png'))
    fundo = Image.open(os.path.join(d, 'fundo.png')).convert('RGBA')
    capa = _cobrir(Image.open(os.path.join(d, 'capa_base.png')).convert('RGBA'), 600, 900, ax=_CAPA_X.get(codigo, 0.5), ay=0.4)
    capa = _degrade(capa, True, 0.38)
    lw = 540
    lg = logo.resize((lw, round(logo.height * lw / logo.width)), Image.LANCZOS)
    capa.alpha_composite(lg, ((600 - lw) // 2, 34))
    banner = _degrade(_cobrir(fundo, 920, 430, ay=0.3), False, 0.55)
    lw = 440
    lg = logo.resize((lw, round(logo.height * lw / logo.width)), Image.LANCZOS)
    banner.alpha_composite(lg, ((920 - lw) // 2, 430 - lg.height - 22))
    out = {}
    for nome, im in (('capa', capa), ('banner', banner), ('logo', logo)):
        out[nome] = os.path.join(tmp, '%s_%s_local.png' % (codigo, nome))
        im.save(out[nome])
    out['hero'] = os.path.join(d, 'fundo.png')
    out['icone'] = icone
    return out


def preparar(src, dst, tamanho=None, cortar_topo=0.0, ay=0.5):
    """Copia a arte para a grid, no tamanho que a Steam usa (corta para a proporção, sem esticar)."""
    from PIL import Image
    im = Image.open(src)
    im = im.convert('RGBA' if im.mode in ('RGBA', 'LA', 'P') else 'RGB')
    if cortar_topo:
        im = im.crop((0, int(im.height * cortar_topo), im.width, im.height))
    if tamanho:
        tw, th = tamanho
        esc = max(tw / im.width, th / im.height)
        im = im.resize((max(tw, round(im.width * esc)), max(th, round(im.height * esc))), Image.LANCZOS)
        x, y = (im.width - tw) // 2, int((im.height - th) * ay)  # ay < 0,5: guarda o alto (a cabeça do Kratos)
        im = im.crop((x, y, x + tw, y + th))
    im.save(dst)


# ------------------------------------------------------------------ o que o Settings chama
def estado(jogo_dir):
    steam = steam_dir()
    if not steam:
        return {'steam': None}
    us = usuarios(steam)
    exe = '"%s"' % os.path.join(jogo_dir, EXE)
    tem = []
    for u in us:
        p = os.path.join(steam, 'userdata', u, 'config', 'shortcuts.vdf')
        if os.path.exists(p):
            sc = vdf_ler(open(p, 'rb').read()).get('shortcuts', {})
            tem += [v.get('AppName') for v in sc.values() if v.get('Exe') == exe]
    return {'steam': steam, 'usuarios': len(us), 'aberta': steam_aberta(), 'atalhos': sorted(set(tem))}


def adicionar(jogo_dir, chave_sgdb='', fechar=False, log=print):
    steam = steam_dir()
    if not steam:
        raise RuntimeError('Não achei a Steam neste PC.')
    us = usuarios(steam)
    if not us:
        raise RuntimeError('A Steam não tem nenhuma conta usada neste PC (abra a Steam e entre uma vez).')
    reabrir = False
    if steam_aberta():
        if not fechar:
            raise RuntimeError('steam_aberta')
        log('fechando a Steam...')
        if not fechar_steam(steam):
            raise RuntimeError('A Steam não fechou; feche-a e tente de novo.')
        reabrir = True
    exe_path = os.path.join(jogo_dir, EXE)
    exe = '"%s"' % exe_path
    tmp = os.path.join(jogo_dir, 'data', '_steam_arte')
    os.makedirs(tmp, exist_ok=True)
    artes = {}
    for codigo, nome, ano in JOGOS:
        a = {}
        if chave_sgdb:
            try:
                a = arte_sgdb(chave_sgdb, nome, ano, tmp, log)
            except Exception as e:  # noqa: BLE001
                log('SteamGridDB falhou (%s): usando a arte do jogo' % e)
        loc = arte_local(jogo_dir, codigo, tmp)
        if a:  # a capa da SteamGridDB não leva o corte da capa da coletânea
            loc.pop('cortar_capa', None)
        for k, v in loc.items():
            a.setdefault(k, v)
        artes[codigo] = a
    for u in us:
        cfg = os.path.join(steam, 'userdata', u, 'config')
        grid = os.path.join(cfg, 'grid')
        os.makedirs(grid, exist_ok=True)
        p = os.path.join(cfg, 'shortcuts.vdf')
        if os.path.exists(p):
            shutil.copy2(p, p + '.vitart.bak')  # a lista de atalhos de antes
        d = vdf_ler(open(p, 'rb').read()) if os.path.exists(p) else {'shortcuts': {}}
        sc = d.setdefault('shortcuts', {})
        nossos = {v.get('AppName') for v in sc.values() if v.get('Exe') == exe}
        resto = [v for v in sc.values() if not (v.get('Exe') == exe and v.get('AppName') in [n for _, n, _ in JOGOS])]
        for codigo, nome, _ in JOGOS:
            aid = id_atalho(exe, nome)
            a = artes[codigo]
            icone = ''
            if a.get('icone'):
                icone = os.path.join(grid, '%d_icon%s' % (aid, os.path.splitext(a['icone'])[1]))
                shutil.copyfile(a['icone'], icone)
            if a.get('capa'):
                preparar(a['capa'], os.path.join(grid, '%dp.png' % aid), (600, 900), a.get('cortar_capa', 0.0))
            if a.get('banner'):
                preparar(a['banner'], os.path.join(grid, '%d.png' % aid), (920, 430))
            elif a.get('hero'):
                preparar(a['hero'], os.path.join(grid, '%d.png' % aid), (920, 430), ay=0.2)
            if a.get('hero'):
                preparar(a['hero'], os.path.join(grid, '%d_hero.png' % aid), (1920, 620), ay=0.15)
            if a.get('logo'):
                preparar(a['logo'], os.path.join(grid, '%d_logo.png' % aid))
            resto.append({'appid': aid, 'AppName': nome, 'Exe': exe, 'StartDir': '"%s"' % jogo_dir, 'icon': icone,
                          'ShortcutPath': '', 'LaunchOptions': codigo, 'IsHidden': 0, 'AllowDesktopConfig': 1,
                          'AllowOverlay': 1, 'OpenVR': 0, 'Devkit': 0, 'DevkitGameID': '', 'DevkitOverrideAppID': 0,
                          'LastPlayTime': 0, 'FlatpakAppID': '', 'tags': {'0': 'God of War Collection'}})
        d['shortcuts'] = {str(i): v for i, v in enumerate(resto)}
        open(p, 'wb').write(vdf_gravar(d))
        log('conta %s: %s %s' % (u, 'atualizados' if nossos else 'adicionados', ', '.join(n for _, n, _ in JOGOS)))
    shutil.rmtree(tmp, ignore_errors=True)
    if reabrir:
        subprocess.Popen([os.path.join(steam, 'steam.exe')], creationflags=SEM_JANELA)
        log('Steam aberta de novo')
    return estado(jogo_dir)


if __name__ == '__main__':
    a = sys.argv[1:]
    chave = a[a.index('--chave-sgdb') + 1] if '--chave-sgdb' in a else ''
    print(adicionar(os.path.abspath(a[0]), chave, fechar='--fechar-steam' in a))
