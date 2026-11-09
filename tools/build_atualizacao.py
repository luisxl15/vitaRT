"""Pacotes da release para o atualizador do Settings (apps/vitart-ui/atualizador.js).

    python tools/build_atualizacao.py <pasta do jogo> <saída> <work.bin> --versao v0.2.0 [--sha <SHA-256 do PKG>]
                                      [--opcionais] [--repo <pasta do repositório>]

<saída>/atualizacao__manifesto.bin, atualizacao__gow-NN.bin   o que muda no vitart: exes, DLLs do jogo recompilado,
    shaders, ferramentas e a tela delas, com data/versao.txt = versão. Tudo cifrado com a chave do PKG + work.bin
    (tools/empacotar_instalador.js), então a release pública não serve sem o jogo.
--opcionais: também opcional-<nome>__... (texturas HD, PBR, áudio do PS2, vídeos HD; ver build_instalador.OPCIONAIS).
--repo: a mesma atualização em blocos de 95 MB em <repo>/atualizacoes/<versão>/ (o GitHub não aceita arquivo de mais
    de 100 MB no repositório): a pasta pronta, sem compilar nada, para quem preferir baixar de lá.

Os patches do menu (data/mods/*.vtpatch) não vão: dependem dos mods de cada um; o Settings refaz depois de atualizar.
"""
import argparse
import os
import shutil
import subprocess
import sys
import tempfile

TOOLS = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, TOOLS)
import build_instalador as BI  # noqa: E402

# o que uma atualização leva (prefixos relativos à pasta do jogo)
ATUALIZA = ['God of War Collection.exe', 'Settings.exe', 'bin/gow1.dll', 'bin/gow2.dll', 'bin/eboot.dll', 'bin/libc.dll',
            'bin/libfios2.dll', 'bin/link.hlevars.txt', 'shaders/', 'Ferramentas/tools/', 'Ferramentas/vitart-ui/resources/app/',
            'Ferramentas/docs/', 'data/versao.txt']


def empacotar(jogo, saida, rif, sha, so, nome, troca=None, bloco=None):
    tmp = tempfile.mkdtemp(prefix='vitart_at_')
    env = dict(os.environ)
    if bloco:
        env['VTPK_BLOCO'] = str(bloco)
    args = ['node', os.path.join(TOOLS, 'empacotar_instalador.js'), jogo, tmp, rif, sha] + ['--so=' + c for c in so]
    if troca:
        args.append('--troca=' + troca)
    subprocess.run(args, check=True, env=env)
    os.makedirs(saida, exist_ok=True)
    for f in sorted(os.listdir(tmp)):
        shutil.move(os.path.join(tmp, f), os.path.join(saida, '%s__%s' % (nome, f)))
    shutil.rmtree(tmp, ignore_errors=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('jogo')
    ap.add_argument('saida')
    ap.add_argument('rif')
    ap.add_argument('--versao', required=True)
    ap.add_argument('--sha', default=BI.SHA_PKG)
    ap.add_argument('--opcionais', action='store_true')
    ap.add_argument('--repo')
    a = ap.parse_args()
    jogo, out = os.path.abspath(a.jogo), os.path.abspath(a.saida)
    troca = tempfile.mkdtemp(prefix='vitart_versao_')
    os.makedirs(os.path.join(troca, 'data'))
    open(os.path.join(troca, 'data', 'versao.txt'), 'w', encoding='utf-8', newline='\n').write(a.versao + '\n')
    # o versao.txt da troca só entra se existir na pasta do jogo: garante que exista
    vj = os.path.join(jogo, 'data', 'versao.txt')
    if not os.path.exists(vj):
        open(vj, 'w', encoding='utf-8', newline='\n').write(a.versao + '\n')
    # traduções (Settings > Idioma do jogo): só as fontes e o idioma.ini. records/ fica de fora: é gerado em cada PC e,
    # no francês e no espanhol do GoW2, traz o texto oficial do jogo
    tdir = os.path.join(jogo, 'data', 'traducoes')
    for c in sorted(os.listdir(tdir)) if os.path.isdir(tdir) else []:
        ATUALIZA.extend(['data/traducoes/%s/fontes/' % c, 'data/traducoes/%s/idioma.ini' % c])
    print('== atualização', a.versao)
    empacotar(jogo, out, a.rif, a.sha, ATUALIZA, 'atualizacao', troca)
    if a.opcionais:
        for nome, cs in BI.OPCIONAIS:
            print('== opcional', nome)
            empacotar(jogo, out, a.rif, a.sha, cs, 'opcional-' + nome)
    if a.repo:
        dst = os.path.join(os.path.abspath(a.repo), 'atualizacoes', a.versao)
        print('== pasta pronta no repositório:', dst)
        empacotar(jogo, dst, a.rif, a.sha, ATUALIZA, 'atualizacao', troca, bloco=95 * 1024 * 1024)
    shutil.rmtree(troca, ignore_errors=True)
    print('pronto:', out)


if __name__ == '__main__':
    main()
