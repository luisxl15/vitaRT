"""Monta o instalador do God of War Collection a partir da pasta do jogo (tools/montar_jogo.py).

    python tools/build_instalador.py <pasta do jogo> <saída> <work.bin> [--sha <SHA-256 do PKG>] [--sem-dados]

    <saída>\\Instalar God of War Collection.exe   lançador nativo (abre o instalador)
    <saída>\\instalador\\                          o instalador (Electron, apps/instalador)
    <saída>\\dados\\                               o jogo inteiro, cifrado (tools/empacotar_instalador.js)

Os dados só abrem com a chave tirada do work.bin e do PKG USA de quem instala. O SHA-256 padrão é o do PKG
conferido em docs/BUILD.md. --sem-dados monta só o programa (para testar a tela).
"""
import argparse
import io
import os
import shutil
import subprocess
import sys
import tempfile

TOOLS = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(TOOLS)
sys.path.insert(0, TOOLS)
SHA_PKG = 'e00a3198376e2e1f99c70786f7d5454a8b9bdf3f8021aaa503e2199e95547417'
ARTE_WEB = os.path.join(REPO, '..', 'gow-dump', 'arte_web', 'x4')  # logo e fundos do LaunchBox, ampliados

LEIA_ME = '''Instalador do God of War Collection (PS Vita no PC)
=================================================

1. Abra "Instalar God of War Collection.exe".
2. Aponte o PKG americano do jogo (gowHD_PSV.pkg, PCSA00126, 3,3 GB) e o work.bin da sua licença.
   Os dados deste instalador são cifrados com a chave desses dois arquivos: sem eles, nada é instalado.
3. Escolha a pasta e instale.

Mantenha juntas as pastas "instalador" e "dados".
'''


# Mods que não vão no instalador. None = nenhum: o jogo instalado vem só com as texturas, sem traduções nem o Kratos do
# GoW3 (decisão dele); quem quiser instala os mods depois pelo Mod Studio.
SEM_MODS = None


def sem_mods(jogo, tmp):
    """Argumentos do empacotador para deixar SEM_MODS de fora: sem a pasta deles e, numa pasta de troca, a lista de
    mods renumerada, o patch do menu (página Mods) refeito com ela e as opções sem as linhas mod_<id>."""
    import vitart_modkit as K
    mods = os.path.join(jogo, 'data', 'mods')
    sem = SEM_MODS or [d for d in os.listdir(mods) if os.path.exists(os.path.join(mods, d, 'mod.ini'))]
    print('   ', ', '.join(sem) or '(nenhum mod)')
    troca = os.path.join(tmp, 'troca')
    tmods = os.path.join(troca, 'data', 'mods')
    os.makedirs(tmods)
    linhas, idx, jogos = [], {}, set()
    for l in open(os.path.join(mods, 'modlist.tsv'), encoding='utf-8').read().splitlines():
        c = l.split('\t')
        if len(c) < 4:
            continue
        if c[2] in sem:
            jogos.add(c[0])
            continue
        i = idx.get(c[0], 0)
        idx[c[0]] = i + 1
        linhas.append('\t'.join([c[0], str(i), c[2]] + c[3:]))
    lista = os.path.join(tmods, 'modlist.tsv')
    open(lista, 'w', encoding='utf-8', newline='\n').write('\n'.join(linhas) + '\n')
    for g in sorted(jogos):  # o menu do jogo lista os mods pelo índice: refeito com a lista nova
        ps = os.path.join(jogo, 'game', 'PCSA00126', 'exec', K.PSARC[g])
        subprocess.run([sys.executable, '-P', os.path.join(TOOLS, 'gow_menu_mod.py'), ps,
                        os.path.join(tmods, K.PSARC[g] + '.vtpatch'), '--modlist', lista], check=True)
    ini = os.path.join(jogo, 'data', 'vitart_options.ini')
    if os.path.exists(ini):
        # sem os mods, sem a ISO de quem montou (caminho da máquina dele) e com os cheats desligados
        fora = tuple('mod_%s=' % m for m in sem) + ('mod_', 'ps2_iso=')
        txt = [l.split('=')[0] + '=0' if l.startswith('cheat_') else l
               for l in open(ini, encoding='utf-8', errors='replace').read().splitlines() if not l.startswith(fora)]
        open(os.path.join(troca, 'data', 'vitart_options.ini'), 'w', encoding='utf-8', newline='\n').write('\n'.join(txt) + '\n')
    # troféus zerados: o runtime cria data/trophy/<NPWR>/unlocked.txt no primeiro troféu
    return ['--sem=data/mods/%s/' % m for m in sem] + ['--sem=data/trophy/', '--troca=' + troca]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('jogo')
    ap.add_argument('saida')
    ap.add_argument('rif')
    ap.add_argument('--sha', default=SHA_PKG)
    ap.add_argument('--sem-dados', action='store_true')
    a = ap.parse_args()
    import build_vitart_ui as B
    import montar_jogo as MJ
    jogo, out = os.path.abspath(a.jogo), os.path.abspath(a.saida)
    os.makedirs(out, exist_ok=True)

    print('== instalador (Electron)')
    dist = os.path.join(REPO, 'apps', 'vitart-ui', 'node_modules', 'electron', 'dist')
    inst = os.path.join(out, 'instalador')
    MJ.espelhar(dist, inst, lambda rel: rel in ('default_app.asar', 'resources/default_app.asar', 'electron.exe'))
    app = os.path.join(inst, 'resources', 'app')
    if os.path.isdir(app):
        shutil.rmtree(app)  # a cópia anterior, gerada aqui
    src = os.path.join(REPO, 'apps', 'instalador')
    os.makedirs(app)
    for f in ('package.json', 'main.js', 'preload.js', 'motor.js'):
        shutil.copy2(os.path.join(src, f), app)
    shutil.copytree(os.path.join(src, 'renderer'), os.path.join(app, 'renderer'))
    arte = os.path.join(app, 'arte')
    os.makedirs(arte)
    for f in ('fundo2.png', 'logo.png'):
        shutil.copy2(os.path.join(ARTE_WEB, f), arte)
    # do próprio jogo (tools/vitart_arte.py): a fonte dos menus, a pedra e o friso do HUD
    import vitart_arte as VA
    import vitart_modkit as K
    ua = VA.ensure(K.load_config(), print)
    for nome, f in (('fonte', 'fonte.png'), ('rocha', 'rocha.jpg'), ('friso', 'friso.png'), ('haste', 'haste.png')):
        shutil.copy2(ua[nome], os.path.join(arte, f))
    meta = open(ua['fonte_json'], encoding='utf-8').read()
    open(os.path.join(arte, 'fonte_meta.js'), 'w', encoding='utf-8').write('window.FONTE_META = %s;\n' % meta)

    tmp = tempfile.mkdtemp(prefix='vitart_inst_')
    ico = os.path.join(tmp, 'icone.ico')
    MJ.icone_ico(os.path.join(jogo, 'data', 'ui-arte', 'icone.png'), ico)
    shutil.copy2(ico, os.path.join(app, 'icone.ico'))
    exe = os.path.join(inst, 'Instalador.exe')
    if os.path.exists(exe):
        os.remove(exe)
    shutil.copy2(os.path.join(dist, 'electron.exe'), exe)
    B.set_icon(exe, open(ico, 'rb').read())

    print('== lançador')
    lanc = os.path.join(out, 'Instalar God of War Collection.exe')
    obj = os.path.join(tmp, 'lancador.exe')
    subprocess.run([os.path.join(MJ.LLVM, 'clang++.exe'), '-std=c++20', '-O2', '-municode', os.path.join(src, 'lancador.cpp'), '-o', obj,
                    '-Xlinker', '/SUBSYSTEM:WINDOWS', '-luser32'], check=True)
    rc = os.path.join(tmp, 'l.rc')
    open(rc, 'w', encoding='utf-8').write(MJ.RC.format(ico=ico.replace('\\', '\\\\'), nome='Instalar God of War Collection'))
    res = os.path.join(tmp, 'l.res')
    subprocess.run([os.path.join(MJ.LLVM, 'llvm-rc.exe'), '/C', '65001', '/FO', res, rc], check=True)
    MJ.aplicar_res(obj, res)
    if os.path.exists(lanc):
        os.remove(lanc)
    shutil.copy2(obj, lanc)
    open(os.path.join(out, 'Leia-me.txt'), 'w', encoding='utf-8-sig', newline='\r\n').write(LEIA_ME)

    if not a.sem_dados:
        extra = []
        print('== sem os mods')
        extra = sem_mods(jogo, tmp)
        print('== dados (cifrados)')
        subprocess.run(['node', os.path.join(TOOLS, 'empacotar_instalador.js'), jogo, os.path.join(out, 'dados'), a.rif, a.sha] + extra,
                       check=True)
    print('pronto:', lanc)


if __name__ == '__main__':
    main()
