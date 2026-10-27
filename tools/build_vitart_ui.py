"""Monta os executáveis do vitart Troféus e do vitart Mod Studio (Electron, apps/vitart-ui).

    python tools/build_vitart_ui.py [pasta de saída]     (padrão: ../gow-dump/rt/vitart-ui)

Copia o Electron de apps/vitart-ui/node_modules (não baixa nada), põe o app em resources/app, grava o ícone do
ômega no exe pela API do Windows (sem rcedit) e cria o "vitart Mod Studio.exe" como hard link do mesmo exe: o
nome do arquivo decide a tela, então não são 180 MB duas vezes. O Python e as ferramentas continuam no
repositório (repo.json diz onde).
"""
import ctypes
import io
import json
import os
import shutil
import struct
import sys
from ctypes import wintypes

TOOLS = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(TOOLS)
UI = os.path.join(REPO, 'apps', 'vitart-ui')
sys.path.insert(0, TOOLS)

EXE_T = 'vitart Troféus.exe'
EXE_M = 'vitart Mod Studio.exe'


def set_icon(exe, ico_bytes):
    """Troca o grupo de ícones do exe (o primeiro RT_GROUP_ICON, que é o do programa) pelo .ico dado."""
    k32 = ctypes.WinDLL('kernel32', use_last_error=True)
    k32.LoadLibraryExW.restype = wintypes.HMODULE
    k32.BeginUpdateResourceW.restype = wintypes.HANDLE
    k32.UpdateResourceW.argtypes = [wintypes.HANDLE, wintypes.LPVOID, wintypes.LPVOID, wintypes.WORD, wintypes.LPVOID, wintypes.DWORD]
    k32.EndUpdateResourceW.argtypes = [wintypes.HANDLE, wintypes.BOOL]
    RT_ICON, RT_GROUP_ICON = 3, 14

    # nome e idioma do grupo que já existe, para substituir em vez de somar um segundo
    found = []
    ENUMNAME = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HMODULE, wintypes.LPVOID, wintypes.LPVOID, ctypes.c_void_p)
    ENUMLANG = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HMODULE, wintypes.LPVOID, wintypes.LPVOID, wintypes.WORD, ctypes.c_void_p)
    k32.LoadLibraryExW.argtypes = [wintypes.LPCWSTR, wintypes.HANDLE, wintypes.DWORD]
    k32.EnumResourceNamesW.argtypes = [wintypes.HMODULE, wintypes.LPVOID, ENUMNAME, ctypes.c_void_p]
    k32.EnumResourceLanguagesW.argtypes = [wintypes.HMODULE, wintypes.LPVOID, wintypes.LPVOID, ENUMLANG, ctypes.c_void_p]
    k32.FreeLibrary.argtypes = [wintypes.HMODULE]
    k32.BeginUpdateResourceW.argtypes = [wintypes.LPCWSTR, wintypes.BOOL]
    mod = k32.LoadLibraryExW(exe, None, 0x2)  # LOAD_LIBRARY_AS_DATAFILE

    def on_lang(_m, _t, name, lang, _p):
        found.append((name, lang))
        return False

    def on_name(m, t, name, _p):
        k32.EnumResourceLanguagesW(m, t, name, ENUMLANG(on_lang), None)
        return False
    k32.EnumResourceNamesW(mod, RT_GROUP_ICON, ENUMNAME(on_name), None)
    k32.FreeLibrary(mod)
    if not found:
        raise RuntimeError('o exe não tem ícone para trocar')
    name, lang = found[0]
    if name is None or name >= 0x10000:
        raise RuntimeError('grupo de ícones com nome de texto: não tratado')

    _res, _type, count = struct.unpack_from('<HHH', ico_bytes, 0)
    grp = struct.pack('<HHH', 0, 1, count)
    h = k32.BeginUpdateResourceW(exe, False)
    if not h:
        raise ctypes.WinError(ctypes.get_last_error())
    for i in range(count):
        w, hh, colors, _r, planes, bpp, size, off = struct.unpack_from('<BBBBHHII', ico_bytes, 6 + 16 * i)
        data = ico_bytes[off:off + size]
        rid = 300 + i
        buf = ctypes.create_string_buffer(data, len(data))
        if not k32.UpdateResourceW(h, RT_ICON, rid, lang, buf, len(data)):
            raise ctypes.WinError(ctypes.get_last_error())
        grp += struct.pack('<BBBBHHIH', w, hh, colors, 0, planes, bpp, size, rid)
    gbuf = ctypes.create_string_buffer(grp, len(grp))
    if not k32.UpdateResourceW(h, RT_GROUP_ICON, name, lang, gbuf, len(grp)):
        raise ctypes.WinError(ctypes.get_last_error())
    if not k32.EndUpdateResourceW(h, False):
        raise ctypes.WinError(ctypes.get_last_error())


def main():
    import vitart_tema as T
    out = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(REPO, '..', 'gow-dump', 'rt', 'vitart-ui'))
    dist = os.path.join(UI, 'node_modules', 'electron', 'dist')
    if not os.path.exists(os.path.join(dist, 'electron.exe')):
        raise SystemExit('falta o Electron em %s (veja apps/vitart-ui/README.md)' % dist)
    os.makedirs(out, exist_ok=True)
    print('== Electron ->', out)
    shutil.copytree(dist, out, dirs_exist_ok=True, ignore=shutil.ignore_patterns('default_app.asar', 'electron.exe'))
    app = os.path.join(out, 'resources', 'app')
    if os.path.isdir(app):
        shutil.rmtree(app)  # a cópia anterior do próprio app (gerada aqui), não dado de ninguém
    os.makedirs(app)
    for f in ('main.js', 'preload.js', 'package.json'):
        shutil.copy2(os.path.join(UI, f), app)
    shutil.copytree(os.path.join(UI, 'renderer'), os.path.join(app, 'renderer'))
    json.dump({'repo': REPO}, open(os.path.join(app, 'repo.json'), 'w', encoding='utf-8'))

    ico = io.BytesIO()
    T.app_icon(256).save(ico, 'ICO', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    open(os.path.join(app, 'vitart.ico'), 'wb').write(ico.getvalue())

    exe_t, exe_m = os.path.join(out, EXE_T), os.path.join(out, EXE_M)
    for p in (exe_m, exe_t):  # o hard link e o exe da rodada anterior (gerados aqui)
        if os.path.exists(p):
            os.remove(p)
    shutil.copy2(os.path.join(dist, 'electron.exe'), exe_t)
    print('== ícone')
    set_icon(exe_t, ico.getvalue())
    os.link(exe_t, exe_m)
    print('ok:', exe_t)
    print('ok:', exe_m, '(hard link)')


if __name__ == '__main__':
    main()
