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
    for nome, f in (('fonte', 'fonte.png'), ('rocha', 'rocha.jpg'), ('friso', 'friso.png')):
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
        print('== dados (cifrados)')
        subprocess.run(['node', os.path.join(TOOLS, 'empacotar_instalador.js'), jogo, os.path.join(out, 'dados'), a.rif, a.sha], check=True)
    print('pronto:', lanc)


if __name__ == '__main__':
    main()
