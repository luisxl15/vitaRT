"""Arte das telas do vitart (Troféus e Mod Studio), tirada do próprio jogo de quem usa: nada de arte do jogo vai no
repositório.

    python tools/vitart_arte.py            (o Electron chama sozinho na primeira vez, pela tools/vitart_ponte.py)

Sai do sce_sys (pic0, ícone) e das texturas dos WADs (título do GoW1, Lâminas do Caos, ômega do HUD, friso dourado,
meandro, medalhão de Zeus...). Se o Real-ESRGAN estiver em _deps/realesrgan, as pequenas são ampliadas 4x. Fica
tudo em <vitart-data>/ui-arte com um arte.json; muda VERSAO para refazer.
"""
import json
import os
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vitart_modkit as K  # noqa: E402

VERSAO = 5
ESRGAN = os.path.join(os.path.dirname(K.REPO), '_deps', 'realesrgan', 'realesrgan-ncnn-vulkan.exe')

# nome -> (jogo, wad, pedaço do nome do registro, ampliar?, recorte (x0, y0, x1, y1) ou None)
TEXTURAS = {
    'titulo_gow1': ('gow1', 'wad/r_shells.wad_psp2', 'mai01f_title', True, None),
    'laminas_gow1': ('gow1', 'wad/r_perms.wad_psp2', 'huds017', True, None),
    'tridente': ('gow1', 'wad/r_perms.wad_psp2', 'huds035', True, None),
    'laminas_gow2': ('gow2', 'wad/r_perma.wad_psp2', 'huda011', True, None),
    'omega': ('gow2', 'wad/r_perma.wad_psp2', 'huda029', True, None),
    'velo': ('gow2', 'wad/r_perma.wad_psp2', 'gfleece', True, None),
    'bronze': ('gow2', 'wad/r_perma.wad_psp2', 'huda043', True, None),
    'haste': ('gow2', 'wad/r_perma.wad_psp2', '01ehuda028', True, None),  # a haste dourada sob as barras do HUD
    'friso': ('gow2', 'wad/r_shella.wad_psp2', '019goldrail02', True, (0, 0, 256, 34)),
    'meandro': ('gow2', 'wad/r_shella.wad_psp2', 'topborder01', True, None),
    'medalhao': ('gow2', None, 'islerelief01', False, None),
    'aguia': ('gow2', None, 'decorpalacelava01', False, None),
    'rocha': ('gow2', None, 'mountaintop01', False, None),
}


def esrgan(src, dst):
    """Amplia 4x; sem o Real-ESRGAN, copia."""
    from PIL import Image
    if os.path.exists(ESRGAN):
        r = subprocess.run([ESRGAN, '-i', src, '-o', dst, '-n', 'realesrgan-x4plus'], capture_output=True,
                           creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        if r.returncode == 0 and os.path.exists(dst):
            return True
    Image.open(src).save(dst)
    return False


def find_texture(cfg, game, wad, key):
    ps = K.psarc_path(cfg, game)
    wads = [wad] if wad else [n for n in K.manifest(ps) if n.endswith('.wad_psp2') and '_VitaTV' not in n]
    for w in wads:
        try:
            body = K.read_psarc_file(ps, w)
            for rec, *_ in K.wad_textures(body, game):
                if key in rec:
                    return K.texture_rgba(body, game, rec)
        except Exception:  # noqa: BLE001 - WAD que não abre: tenta o próximo
            continue
    return None


def ensure(cfg, log=print):
    """Gera o que faltar e devolve {nome: caminho}. Rápido quando já está feito."""
    from PIL import Image, ImageDraw
    out = os.path.join(cfg['data'], 'ui-arte')
    man_p = os.path.join(out, 'arte.json')
    if os.path.exists(man_p):
        man = json.load(open(man_p, encoding='utf-8'))
        if man.get('versao') == VERSAO and all(os.path.exists(p) for p in man['arquivos'].values()):
            return man['arquivos']
    os.makedirs(out, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix='vitart_arte_')
    files = {}

    def save(name, img, up, ext='png'):
        dst = os.path.join(out, '%s.%s' % (name, ext))
        if up:
            a = os.path.join(tmp, name + '_in.png')
            b = os.path.join(tmp, name + '_x4.png')
            img.save(a)
            esrgan(a, b)
            img = Image.open(b)
        if ext == 'jpg':
            img.convert('RGB').save(dst, quality=90)
        else:
            img.save(dst)
        files[name] = dst
        log('arte: %s (%dx%d)' % (name, *img.size))

    app = cfg.get('app', '')
    pic0 = os.path.join(app, 'sce_sys', 'pic0.png')
    if os.path.exists(pic0):
        save('chave', Image.open(pic0).convert('RGB'), True, 'jpg')
    icon0 = os.path.join(app, 'sce_sys', 'icon0.png')
    if os.path.exists(icon0):
        save('icone', Image.open(icon0).convert('RGBA'), True)

    for name, (game, wad, key, up, crop) in TEXTURAS.items():
        rgba = find_texture(cfg, game, wad, key)
        if rgba is None:
            log('arte: %s não achada (%s %s)' % (name, game, key))
            continue
        img = Image.fromarray(rgba).convert('RGBA')
        if crop:
            img = img.crop(crop)
        if name == 'medalhao':  # o relevo é redondo: o resto da textura vira transparente
            m = Image.new('L', img.size, 0)
            ImageDraw.Draw(m).ellipse([10, 10, img.width - 10, img.height - 10], fill=255)
            img.putalpha(m)
        save(name, img, up, 'jpg' if name in ('rocha', 'aguia') else 'png')

    try:
        files.update(fonte(cfg, out, tmp, log))
    except Exception as e:  # noqa: BLE001 - sem a fonte as telas usam a do Windows
        log('arte: fonte do jogo não saiu (%s)' % e)

    json.dump({'versao': VERSAO, 'arquivos': files}, open(man_p, 'w', encoding='utf-8'), indent=1)
    return files


# A fonte dos menus (GodOfWarEurope, r_perma do GoW2): os glifos estão soltos na textura, alinhados pelo topo e
# sem tabela legível (as medidas moram em malhas do FLP). Cada caixa é achada pela tinta e o caractere vem desta
# leitura da textura, caixa por caixa: maiúsculas = capitais, minúsculas = versaletes, como o jogo escreve.
FONTE_MAPA = ("()/M©®QÔÖG" "ÂÄYÛÜÇÊËFPÏ" "ÎXKRÒÓÀÁÑ" "ÙÚÈÉÌÍ&ñ?¿!;¡m" "qòóôögàáâäù" "úûüy0ç3pßèéêë"
              "fìíîïWOAHŒN" "UVDCkrxTZB" "EL4689JS2571I" "+woahnuvœcd" "tzbelsji:*,'\"\"=°.-")
FONTE_RABICHO = set('MQGYXKRFPÇmqgyxkrfpç')  # o traço desce abaixo da linha de base
FONTE_ALTO = set('*°\'"')                     # ficam no alto da linha


def fonte(cfg, out, tmp, log):
    import numpy as np
    from PIL import Image
    rgba = find_texture(cfg, 'gow2', 'wad/r_perma.wad_psp2', 'godofwareurope')
    if rgba is None:
        return {}
    im = Image.fromarray(rgba).convert('RGBA')
    A = np.asarray(im)
    on = (A[:, :, 3] > 40) & (A[:, :, :3].max(2) > 40)
    boxes, ys = [], on.any(1)
    y = 0
    while y < im.height:
        if ys[y]:
            y0 = y
            while y < im.height and ys[y]:
                y += 1
            cols, x = on[y0:y].any(0), 0
            while x < im.width:
                if cols[x]:
                    x0 = x
                    while x < im.width and cols[x]:
                        x += 1
                    rows = np.where(on[y0:y, x0:x].any(1))[0]
                    boxes.append((x0, y0 + int(rows[0]), x, y0 + int(rows[-1]) + 1))
                x += 1
        y += 1
    if len(boxes) != len(FONTE_MAPA):
        raise ValueError('textura da fonte com %d glifos, esperava %d' % (len(boxes), len(FONTE_MAPA)))
    glifos = {c: im.crop(b) for c, b in zip(FONTE_MAPA, boxes)}
    # o jogo não tem Ã/Õ: o til sai do Ñ (capital) e do ñ (versalete)
    for base, til, novo in (('A', 'Ñ', 'Ã'), ('O', 'Ñ', 'Õ'), ('a', 'ñ', 'ã'), ('o', 'ñ', 'õ')):
        t = glifos[til].crop((0, 0, glifos[til].width, glifos[til].height - glifos['N' if til == 'Ñ' else 'n'].height))
        g = glifos[base]
        img = Image.new('RGBA', (max(g.width, t.width), g.height + t.height), (0, 0, 0, 0))
        img.alpha_composite(t, ((img.width - t.width) // 2, 0))
        img.alpha_composite(g, ((img.width - g.width) // 2, t.height))
        glifos[novo] = img
    # nem %: a barra com dois anéis do ° nas pontas
    bar, anel = glifos['/'], glifos['°']
    img = Image.new('RGBA', (bar.width + anel.width, bar.height), (0, 0, 0, 0))
    img.alpha_composite(bar, (anel.width // 2, 0))
    img.alpha_composite(anel, (0, 1))
    img.alpha_composite(anel, (img.width - anel.width, bar.height - anel.height - 1))
    glifos['%'] = img
    # linha de base medida do topo do glifo (capital 19 px, versalete 15)
    def base(c, g):
        alt = 15 if c.islower() else 19
        if c in FONTE_RABICHO:  # começa no topo da capital; o rabicho passa da base
            return alt
        if c in FONTE_ALTO:
            return 19
        if c == '-':
            return g.height + 7
        if c == '=':
            return g.height + 5
        if c == ',':
            return 5
        return g.height
    # empacota numa faixa só e amplia 4x
    S = 4
    larg = sum(g.width + 2 for g in glifos.values())
    alt = max(g.height for g in glifos.values())
    atlas = Image.new('RGBA', (larg, alt), (0, 0, 0, 0))
    meta, x = {}, 0
    for c, g in glifos.items():
        atlas.alpha_composite(g, (x, 0))
        meta[c] = [x * S, 0, g.width * S, g.height * S, base(c, g) * S]
        x += g.width + 2
    a = os.path.join(tmp, 'fonte_in.png')
    b = os.path.join(tmp, 'fonte_x4.png')
    atlas.save(a)
    if not esrgan(a, b):
        atlas.resize((larg * S, alt * S), Image.LANCZOS).save(b)
    dst = os.path.join(out, 'fonte.png')
    Image.open(b).save(dst)
    jdst = os.path.join(out, 'fonte.json')
    json.dump({'escala': S, 'capital': 19 * S, 'versalete': 15 * S, 'espaco': 8 * S, 'entre': 1 * S, 'glifos': meta},
              open(jdst, 'w', encoding='utf-8'), ensure_ascii=False)
    log('arte: fonte do jogo (%d glifos)' % len(meta))
    return {'fonte': dst, 'fonte_json': jdst}


if __name__ == '__main__':
    print(json.dumps(ensure(K.load_config()), indent=1))
