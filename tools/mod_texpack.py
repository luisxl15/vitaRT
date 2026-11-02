"""Texturas de um mod em HD: amplia com o Real-ESRGAN as texturas que o mod traz (as que não existem no jogo) e grava
um pack dentro do próprio mod.

    python tools/mod_texpack.py <pasta do mod> [--jogo gow2] [--modelo realesrgan-x4plus]

Saída: <mod>/texpack/index.tsv + PNGs, com a chave do pack do vitart (hle_gxm.cpp, texpack_key). O runtime lê o pack
dos mods do jogo em execução depois do pack principal (que tem a vez se a chave for a mesma). Como a chave vem do
conteúdo da textura, ele só pega com o mod ligado: desligado, essas texturas nem chegam à memória.

A cor vai pelo modelo; o alfa, quando a textura tem transparência, vai pelo modelo também (como imagem cinza), que
deixa a borda das tiras e das correntes mais limpa que uma interpolação.
"""
import argparse
import os
import shutil
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gxm_tex_dump as D  # noqa: E402
import psarc_gxp as P  # noqa: E402
import texpack_match as T  # noqa: E402
import vitart_modkit as K  # noqa: E402

ESRGAN = os.path.join(os.path.dirname(K.REPO), '_deps', 'realesrgan', 'realesrgan-ncnn-vulkan.exe')


def texturas_do_wad(body, game):
    """[(chave, rgba)] das texturas do Vita de um WAD (uma por variante de paleta)."""
    out = []
    for r in K.wad_records(body, game):
        if not K.is_texture(r):
            continue
        gxt = r[3][14:]
        for ti, t, poff in T.gxt_textures(gxt):
            k = T.vita_key(gxt, ti, poff)
            if k is not None:
                out.append((k, r[2], gxt, t))
    return out


def chaves_do_jogo(cfg, game):
    ps = K.psarc_path(cfg, game)
    names = K.manifest(ps)
    _, ents, zs, block = K._MANIFEST[ps]
    chaves = set()
    with open(ps, 'rb') as fh:
        for k, n in enumerate(names):
            if n.endswith('.wad_psp2') and k + 1 < len(ents):
                chaves.update(c for c, *_ in texturas_do_wad(P.read_file(fh, ents[k + 1], zs, block), game))
    return chaves


def esrgan_pasta(src, dst, modelo):
    os.makedirs(dst, exist_ok=True)
    r = subprocess.run([ESRGAN, '-i', src, '-o', dst, '-n', modelo, '-f', 'png'], capture_output=True, text=True,
                       creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    if r.returncode != 0:
        raise RuntimeError('Real-ESRGAN falhou: ' + (r.stderr or r.stdout)[-400:])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('mod')
    ap.add_argument('--jogo', default='gow2')
    ap.add_argument('--modelo', default='realesrgan-x4plus')
    a = ap.parse_args()
    if not os.path.exists(ESRGAN):
        sys.exit('sem o Real-ESRGAN em ' + ESRGAN)
    cfg = K.load_config()
    print('== texturas do jogo (para saber o que é do mod)')
    base = chaves_do_jogo(cfg, a.jogo)
    print('  ', len(base), 'chaves')

    print('== texturas do mod')
    novas = {}
    for raiz, _, fs in os.walk(os.path.join(a.mod, 'files')):
        for f in sorted(fs):
            if not f.endswith('.wad_psp2'):
                continue
            body = open(os.path.join(raiz, f), 'rb').read()
            for k, nome, gxt, t in texturas_do_wad(body, a.jogo):
                if k not in base and k not in novas:
                    novas[k] = (nome, D.decode(T.GxtMem(gxt), t))
    print('  ', len(novas), 'texturas novas:', ', '.join(sorted({n for n, _ in novas.values()}))[:600])
    if not novas:
        return

    tmp = tempfile.mkdtemp(prefix='vitart_modtex_')
    cor, alfa, cor4, alfa4 = (os.path.join(tmp, x) for x in ('cor', 'alfa', 'cor4', 'alfa4'))
    os.makedirs(cor), os.makedirs(alfa)
    com_alfa = set()
    for k, (nome, rgba) in novas.items():
        Image.fromarray(np.ascontiguousarray(rgba[:, :, :3]), 'RGB').save(os.path.join(cor, '%016x.png' % k))
        a_ = rgba[:, :, 3]
        if a_.min() < 250:
            com_alfa.add(k)
            Image.fromarray(np.ascontiguousarray(np.repeat(a_[:, :, None], 3, 2)), 'RGB').save(os.path.join(alfa, '%016x.png' % k))
    print('== Real-ESRGAN 4x (%d de cor, %d de alfa)' % (len(novas), len(com_alfa)))
    esrgan_pasta(cor, cor4, a.modelo)
    if com_alfa:
        esrgan_pasta(alfa, alfa4, a.modelo)

    saida = os.path.join(a.mod, 'texpack')
    if os.path.isdir(saida):
        shutil.rmtree(saida)  # o pack anterior, gerado aqui
    os.makedirs(saida)
    linhas = ['# texturas do mod ampliadas 4x com o Real-ESRGAN (tools/mod_texpack.py)']
    for k, (nome, rgba) in sorted(novas.items()):
        img = np.array(Image.open(os.path.join(cor4, '%016x.png' % k)).convert('RGB'))
        h, w = img.shape[:2]
        if k in com_alfa:
            av = np.array(Image.open(os.path.join(alfa4, '%016x.png' % k)).convert('L').resize((w, h), Image.LANCZOS))
        else:
            av = np.full((h, w), 255, np.uint8)
        arq = '%016x.png' % k
        Image.fromarray(np.dstack([img, av]), 'RGBA').save(os.path.join(saida, arq), optimize=True)
        linhas.append('%016x\t%s' % (k, arq))
    open(os.path.join(saida, 'index.tsv'), 'w', encoding='utf-8', newline='\n').write('\n'.join(linhas) + '\n')
    shutil.rmtree(tmp, ignore_errors=True)
    print('pronto:', len(novas), 'texturas em', saida)


if __name__ == '__main__':
    main()
