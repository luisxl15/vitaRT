"""Python portátil para as ferramentas (Troféus, Mod Studio, Settings): copiado do Python desta máquina, sem baixar nada.

    python tools/python_portatil.py <destino>       (o montar_jogo.py chama sozinho: Ferramentas\\python)

Quem instala o jogo não precisa ter Python: o Electron (apps/vitart-ui/main.js) usa <Ferramentas>\\python\\python.exe
quando existe. Vai o executável, as DLLs, a biblioteca padrão sem testes/IDLE (o Tk vai: o vitart_trofeus.py ainda o importa) e os pacotes que as ferramentas usam
(numpy, Pillow, xxhash). Com a pasta Lib ao lado do python.exe ele se acha sozinho (não usa registro nem PATH).
"""
import os
import shutil
import sys

PACOTES = ('numpy', 'numpy.libs', 'PIL', 'pillow.libs', 'xxhash')
FORA_LIB = {'test', 'idlelib', 'turtledemo', 'ensurepip', 'site-packages', 'lib2to3', '__pycache__',
            'venv', 'pydoc_data'}


def _ignorar(pasta, nomes):
    return [n for n in nomes if n in ('__pycache__', 'tests') or n.endswith(('.pyc', '.pdb'))]


def achar_pacote(nome):
    for sp in sys.path:
        p = os.path.join(sp, nome)
        if sp.endswith('site-packages') and os.path.isdir(p):
            return p
    return None


def montar(dst, log=print):
    base = sys.base_prefix
    if os.path.isdir(dst):
        shutil.rmtree(dst)  # a cópia anterior, gerada aqui
    os.makedirs(dst)
    for f in os.listdir(base):
        if f.lower().endswith(('.exe', '.dll')) or f == 'LICENSE.txt':
            shutil.copy2(os.path.join(base, f), dst)
    shutil.copytree(os.path.join(base, 'DLLs'), os.path.join(dst, 'DLLs'), ignore=lambda d, ns: [n for n in ns if n.endswith('.pdb')])
    if os.path.isdir(os.path.join(base, 'tcl')):  # o vitart_trofeus.py ainda importa o tkinter
        shutil.copytree(os.path.join(base, 'tcl'), os.path.join(dst, 'tcl'), ignore=_ignorar)
    lib = os.path.join(dst, 'Lib')
    os.makedirs(lib)
    src_lib = os.path.join(base, 'Lib')
    for n in os.listdir(src_lib):
        if n in FORA_LIB:
            continue
        s = os.path.join(src_lib, n)
        if os.path.isdir(s):
            shutil.copytree(s, os.path.join(lib, n), ignore=_ignorar)
        elif not n.endswith('.pyc'):
            shutil.copy2(s, lib)
    sp = os.path.join(lib, 'site-packages')
    os.makedirs(sp)
    faltam = []
    for p in PACOTES:
        s = achar_pacote(p)
        if s is None:
            if not p.endswith('.libs'):
                faltam.append(p)
            continue
        shutil.copytree(s, os.path.join(sp, p), ignore=_ignorar)
    tam = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(dst) for f in fs)
    log('   Python %d.%d portátil: %.0f MB%s' % (sys.version_info[0], sys.version_info[1], tam / 2**20,
                                              ', SEM ' + ', '.join(faltam) if faltam else ''))
    return dst


if __name__ == '__main__':
    montar(os.path.abspath(sys.argv[1]))
