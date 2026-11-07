"""Ponte entre as telas em Electron (apps/vitart-ui) e as ferramentas em Python do vitart.

    python tools/vitart_ponte.py

Fala JSON, uma mensagem por linha:
    entra  {"id": 7, "m": "mods", "a": {...}}
    sai    {"id": 7, "ok": true, "r": ...}   ou   {"id": 7, "ok": false, "erro": "..."}
    evento {"ev": "log", "canal": "conv", "t": "..."}   (saída das tarefas longas, que rodam numa thread)
O stdout é só do protocolo: qualquer print das ferramentas vai para o stderr.
"""
import base64
import io
import json
import os
import shutil
import sys
import threading
import time
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
_OUT = sys.stdout
sys.stdout = sys.stderr  # os print() do modkit não podem sujar o protocolo

import vitart_modkit as K  # noqa: E402

_lock = threading.Lock()
_busy = threading.Lock()  # uma tarefa longa por vez, como no Mod Studio antigo


def send(obj):
    with _lock:
        _OUT.write(json.dumps(obj, ensure_ascii=False) + '\n')
        _OUT.flush()


def logger(canal):
    return lambda t: send({'ev': 'log', 'canal': canal, 't': str(t)})


def png64(img, max_side=None):
    from PIL import Image
    if not isinstance(img, Image.Image):
        img = Image.fromarray(img)
    if max_side:
        img = img.copy()
        img.thumbnail((max_side, max_side), Image.LANCZOS)
    b = io.BytesIO()
    img.save(b, 'PNG')
    return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()


cfg = K.load_config()


# ------------------------------------------------------------------ troféus
GAMES = [('NPWR05244_00', 'gow1', 'God of War'), ('NPWR05283_00', 'gow2', 'God of War II')]
POINTS = {'B': 15, 'S': 30, 'G': 90, 'P': 180}


def m_trofeus(a):
    """Os dois jogos com a lista inteira (ícone em data URL) e o que já foi pego."""
    import vitart_trofeus as TR
    guide_p = os.path.join(K.TOOLS, 'trofeus_guia.json')
    guide = json.load(open(guide_p, encoding='utf-8')) if os.path.exists(guide_p) else {}
    out = []
    for comm, game, title in GAMES:
        # nomes e descrições oficiais traduzidos que vêm no TRP; o guia (descrição e dica) só existe em português
        idioma = a.get('idioma', 'pt')
        sfm = {'fr': 'TROP_02.SFM', 'es': 'TROP_03.SFM', 'de': 'TROP_04.SFM', 'it': 'TROP_05.SFM'}.get(idioma, 'TROP.SFM')
        try:
            tr = TR.load_set(cfg, comm, guide if idioma == 'pt' else {}, sfm)
        except Exception as e:  # noqa: BLE001 - um jogo sem TRP não derruba o outro
            out.append({'comm': comm, 'game': game, 'title': title, 'erro': str(e), 'lista': []})
            continue
        lista = [{'id': t['id'], 'tipo': t['type'], 'oculto': t['hidden'], 'nome': t['name'], 'detalhe': t['detail'],
                  'desc': t['desc'], 'dica': t['tip'], 'icone': png64(t['icon']) if t['icon'] else None,
                  'pontos': POINTS[t['type']]} for t in tr]
        out.append({'comm': comm, 'game': game, 'title': title, 'lista': lista, 'obtidos': sorted(m_obtidos({'comm': comm}))})
    return out


def m_obtidos(a):
    p = os.path.join(cfg['data'], 'trophy', a['comm'], 'unlocked.txt')
    if not os.path.exists(p):
        return []
    return sorted({int(x) for x in open(p, encoding='utf-8', errors='replace').read().split() if x.isdigit()})


def m_obtidos_todos(a):
    """{comm: [ids], ...} com a data de modificação, para a tela só reler quando muda."""
    r = {}
    for comm, _g, _t in GAMES:
        p = os.path.join(cfg['data'], 'trophy', comm, 'unlocked.txt')
        r[comm] = {'mtime': os.path.getmtime(p) if os.path.exists(p) else 0, 'ids': m_obtidos({'comm': comm})}
    return r


# ------------------------------------------------------------------ arte do jogo (cache em vitart-data/ui-arte)
def m_arte(a):
    import vitart_arte as A
    return A.ensure(cfg, logger('arte'))


# ------------------------------------------------------------------ mods
def mod_json(m):
    return {'id': m.id, 'nome': m.name, 'jogo': m.game, 'autor': m.author, 'versao': m.version, 'desc': m.description,
            'ligado': m.enabled, 'arquivos': len(m.files()) + len(m.files('src')), 'tamanho': m.size(), 'pasta': m.dir,
            'lista': (m.files() + m.files('src'))[:40]}


def m_mods(a):
    return [mod_json(m) for m in K.list_mods(cfg)]


def m_ligar(a):
    K.set_enabled(cfg, a['id'], bool(a['on']))
    return m_mods(a)


def m_ordem(a):
    mods = {m.id: m for m in K.list_mods(cfg)}
    K.write_modlist(cfg, [mods[i] for i in a['ids'] if i in mods] + [m for i, m in mods.items() if i not in a['ids']])
    return m_mods(a)


def m_remover(a):
    m = next((x for x in K.list_mods(cfg) if x.id == a['id']), None)
    if not m:
        raise ValueError('mod não encontrado: %s' % a['id'])
    dst = os.path.join(cfg['data'], 'mods_removidos', '%s_%s' % (m.id, time.strftime('%Y%m%d_%H%M%S')))
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.move(m.dir, dst)  # nada é apagado: vai para mods_removidos
    K.set_enabled(cfg, m.id, False)
    return {'destino': dst, 'mods': m_mods(a)}


def m_abrir(a):
    os.startfile(a.get('pasta') or K.mods_dir(cfg))
    return True


def tarefa(canal, fn):
    """Roda fn numa thread; o fim chega como evento {"ev": "fim", "canal", "ok", "r"|"erro"}."""
    if not _busy.acquire(blocking=False):
        raise RuntimeError('Espere a operação atual terminar.')
    log = logger(canal)

    def body():
        try:
            r = fn(log)
            send({'ev': 'fim', 'canal': canal, 'ok': True, 'r': r})
        except Exception as e:  # noqa: BLE001 - qualquer falha vai para o registro da tela
            log('ERRO: %s' % e)
            send({'ev': 'fim', 'canal': canal, 'ok': False, 'erro': str(e)})
        finally:
            _busy.release()
    threading.Thread(target=body, daemon=True).start()
    return 'iniciado'


def m_reconstruir(a):
    return tarefa(a.get('canal', 'mods'), lambda log: K.rebuild(cfg, log))


def m_converter(a):
    mid = a.get('id') or K.safe_id(a['nome'])
    return tarefa('conv', lambda log: K.convert_ps2(cfg, a.get('jogo', 'gow2'), a['patch'], a['iso'], mid, a['nome'],
                                                     author=a.get('autor', ''), description=a.get('desc', ''), log=log,
                                                     keep_work=bool(a.get('manter'))))


# ------------------------------------------------------------------ textos
def m_exportar_textos(a):
    game, out = a['jogo'], a['saida']
    open(out, 'wb').write(K.text_body(cfg, game))
    return out


def m_instalar_textos(a):
    mid = a.get('id') or K.safe_id(a['nome'])
    return tarefa('txt', lambda log: K.make_text_mod(cfg, mid, a['nome'], a['jogo'], a['arquivo'],
                                                      author=a.get('autor', ''), log=log))


# ------------------------------------------------------------------ texturas
_wad_cache = {}
_trocas = {}  # (jogo, wad, registro) -> (png, rgba)


def _wad_body(game, wad):
    k = (game, wad)
    if k not in _wad_cache:
        ps = K.psarc_path(cfg, game)
        tv = wad.replace('wad/', 'wad/_VitaTV/', 1)
        src = tv if tv in K.manifest(ps) else wad  # a versão do PS TV é a que o vitart carrega
        _wad_cache.clear()
        _wad_cache[k] = K.read_psarc_file(ps, src)
    return _wad_cache[k]


def m_wads(a):
    ps = K.psarc_path(cfg, a['jogo'])
    if not os.path.exists(ps):
        raise FileNotFoundError('psarc não encontrado: %s (veja Configurações)' % ps)
    return [n for n in K.manifest(ps) if n.endswith('.wad_psp2') and '_VitaTV' not in n]


def m_texturas(a):
    game, wad = a['jogo'], a['wad']
    body = _wad_body(game, wad)
    out = []
    for name, w, h, fmt in K.wad_textures(body, game):
        ch = _trocas.get((game, wad, name))
        out.append({'nome': name, 'w': w, 'h': h, 'fmt': fmt, 'troca': os.path.basename(ch[0]) if ch else ''})
    return out


def m_miniaturas(a):
    """Miniaturas de 96 px de todas as texturas do WAD, para a grade."""
    game, wad = a['jogo'], a['wad']
    body = _wad_body(game, wad)
    r = {}
    for name in a['nomes']:
        ch = _trocas.get((game, wad, name))
        try:
            r[name] = png64(ch[1] if ch else K.texture_rgba(body, game, name), 96)
        except Exception:  # noqa: BLE001 - textura que não decodifica fica sem miniatura
            r[name] = None
    return r


def m_previa(a):
    game, wad, name = a['jogo'], a['wad'], a['nome']
    ch = _trocas.get((game, wad, name))
    return png64(ch[1] if ch else K.texture_rgba(_wad_body(game, wad), game, name), 512)


def _png_name(name):
    return name.strip('~').replace('~', '_') + '.png'


def m_exportar_png(a):
    from PIL import Image
    Image.fromarray(K.texture_rgba(_wad_body(a['jogo'], a['wad']), a['jogo'], a['nome'])).save(a['saida'])
    return a['saida']


def m_exportar_todas(a):
    from PIL import Image
    game, wad = a['jogo'], a['wad']
    body = _wad_body(game, wad)
    n = 0
    for name, *_ in K.wad_textures(body, game):
        Image.fromarray(K.texture_rgba(body, game, name)).save(os.path.join(a['pasta'], _png_name(name)))
        n += 1
    return n


def m_trocar(a):
    import numpy as np
    from PIL import Image
    im = Image.open(a['png']).convert('RGBA')
    w, h = im.size
    nota = ''
    if w & (w - 1) or h & (h - 1):  # o Vita quer lados potência de 2
        pw, ph = 1 << (w - 1).bit_length(), 1 << (h - 1).bit_length()
        im = im.resize((pw, ph), Image.LANCZOS)
        nota = '%dx%d -> %dx%d (potência de 2)' % (w, h, pw, ph)
    _trocas[(a['jogo'], a['wad'], a['nome'])] = (a['png'], np.array(im))
    return {'nota': nota, 'previa': m_previa(a)}


def m_desfazer(a):
    _trocas.pop((a['jogo'], a['wad'], a['nome']), None)
    return m_previa(a)


def m_trocas(a):
    return [{'jogo': g, 'wad': w, 'nome': n, 'png': os.path.basename(v[0])} for (g, w, n), v in _trocas.items()]


def m_criar_mod_texturas(a):
    game = a['jogo']
    changes = [(w, n, v[1]) for (g, w, n), v in _trocas.items() if g == game]
    if not changes:
        raise ValueError('Nenhuma textura trocada neste jogo.')

    def go(log):
        K.make_texture_mod(cfg, K.safe_id(a['nome']), a['nome'], game, changes, author=a.get('autor', ''), log=log)
        for k in [k for k in _trocas if k[0] == game]:
            del _trocas[k]
        return a['nome']
    return tarefa('tex', go)


# ------------------------------------------------------------------ configurações e ajuda
def m_config(a):
    return {k: cfg.get(k, '') for k in ('app', 'data', 'work', 'xdelta3', 'sevenzip', 'python')}


def m_salvar_config(a):
    for k, v in a.items():
        cfg[k] = str(v).strip()
    K.save_config(cfg)
    return K.CONFIG


# ------------------------------------------------------------------ Settings (API do jogo)
APIS = ('auto', 'vulkan', 'd3d11')  # renderer= do vitart_options.ini (game_options.cpp, renderer_choice)


def _ini():
    return os.path.join(cfg['data'], 'vitart_options.ini')


def _placas():
    """Nomes das placas de vídeo ligadas a um monitor (EnumDisplayDevicesW), sem repetir."""
    import ctypes
    from ctypes import wintypes

    class DD(ctypes.Structure):
        _fields_ = [('cb', wintypes.DWORD), ('DeviceName', wintypes.WCHAR * 32), ('DeviceString', wintypes.WCHAR * 128),
                    ('StateFlags', wintypes.DWORD), ('DeviceID', wintypes.WCHAR * 128), ('DeviceKey', wintypes.WCHAR * 128)]
    out, i = [], 0
    while True:
        d = DD()
        d.cb = ctypes.sizeof(d)
        if not ctypes.windll.user32.EnumDisplayDevicesW(None, i, ctypes.byref(d), 0):
            break
        if d.StateFlags & 1 and d.DeviceString not in out:  # DISPLAY_DEVICE_ATTACHED_TO_DESKTOP
            out.append(d.DeviceString)
        i += 1
    return out


def _api_da_ultima_sessao():
    """O que o log da última sessão diz que rodou ("renderizador Vulkan ligado" / "Direct3D 11")."""
    raiz = os.path.dirname(cfg['data'])
    for p in (os.path.join(raiz, 'logs', 'vitart.log'), os.path.join(K.REPO, '..', 'gow-dump', 'rt', 'vitart.log')):
        if not os.path.exists(p):
            continue
        api = None
        for l in open(p, encoding='utf-8', errors='replace'):
            if 'renderizador' in l and 'ligado' in l:
                api = 'd3d11' if 'Direct3D' in l else 'vulkan' if 'Vulkan' in l else api
        if api:
            return {'api': api, 'quando': os.path.getmtime(p)}
    return None


def m_opcoes(a):
    api = 'auto'
    if os.path.exists(_ini()):
        for l in open(_ini(), encoding='utf-8', errors='replace'):
            if l.startswith('renderer='):
                api = l[9:].strip().lower() or 'auto'
    sysdir = os.path.join(os.environ.get('SystemRoot', r'C:\Windows'), 'System32')
    # jogo aberto: ele regrava o ini com a API que leu ao abrir quando se muda uma opção no menu de pausa
    import subprocess
    try:
        tl = subprocess.run(['tasklist', '/fo', 'csv', '/nh'], capture_output=True, text=True, errors='replace',
                            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0)).stdout.lower()
    except OSError:
        tl = ''
    return {'api': api if api in APIS else 'auto', 'ini': _ini(), 'placas': _placas(),
            'vulkan': os.path.exists(os.path.join(sysdir, 'vulkan-1.dll')), 'ultima': _api_da_ultima_sessao(),
            'jogo_aberto': '"vitart.exe"' in tl or '"god of war collection.exe"' in tl,
            'flags': _flags(), 'aspecto': _aspecto(), 'texdump_pasta': os.path.join(cfg['data'], 'texdump'),
            'log_pasta': os.path.join(os.path.dirname(cfg['data']), 'logs')}


def _gravar(chave, valor):
    """chave=valor no ini, no lugar da linha que já existe, sem mexer nas outras (o jogo lê ao abrir)."""
    linhas = open(_ini(), encoding='utf-8', errors='replace').read().splitlines() if os.path.exists(_ini()) else []
    p = chave + '='
    tem = any(l.startswith(p) for l in linhas)
    linhas = [p + valor if l.startswith(p) else l for l in linhas] + ([] if tem else [p + valor])
    open(_ini(), 'w', encoding='utf-8', newline='\n').write('\n'.join(linhas) + '\n')


# proporção da tela (ultrawide): aspect= no ini, a mesma escolha da linha Aspect Ratio do menu do jogo
ASPECTOS = ['auto', '16:9', '16:10', '21:9', '32:9', '4:3']


def _aspecto():
    if os.path.exists(_ini()):
        for l in open(_ini(), encoding='utf-8', errors='replace'):
            if l.startswith('aspect='):
                v = l[7:].strip()
                return v if v in ASPECTOS else 'auto'
    return 'auto'


def m_salvar_aspecto(a):
    v = a.get('aspecto')
    if v not in ASPECTOS:
        raise ValueError('proporção desconhecida: %s' % v)
    _gravar('aspect', v)
    return v


def m_salvar_api(a):
    api = a.get('api')
    if api not in APIS:
        raise ValueError('API desconhecida: %s' % api)
    _gravar('renderer', api)
    return api


# chaves do Settings que o runtime lê ao abrir (core.cpp ini_flag) e o padrão de cada uma
FLAGS = {'console': 1, 'log': 1, 'texdump': 0}


def _flags():
    v = dict(FLAGS)
    if os.path.exists(_ini()):
        for l in open(_ini(), encoding='utf-8', errors='replace'):
            k, _, x = l.strip().partition('=')
            if k in v:
                v[k] = 0 if x.strip() == '0' else 1
    return v


def m_criar_pasta(a):
    os.makedirs(a['pasta'], exist_ok=True)
    return a['pasta']


def m_salvar_opcao(a):
    k = a.get('chave')
    if k not in FLAGS:
        raise ValueError('opção desconhecida: %s' % k)
    _gravar(k, '1' if a.get('valor') else '0')
    return _flags()


# Controles: <dados>/controles_<jogo>.ini (runtime/vitart/input_map.cpp lê, inclusive com o jogo aberto). O padrão é
# o mesmo de games/gow/gow_profile.cpp (game_default_controls): mudou lá, muda aqui.
CTL_PADRAO = {
    'cruz': 'SPACE', 'quadrado': 'LBUTTON', 'triangulo': 'RBUTTON', 'circulo': 'F, MBUTTON', 'l1': 'Q', 'l2': 'LCTRL',
    'furia': 'V, SHIFT+MBUTTON', 'cima': '1, UP', 'direita': '2, RIGHT', 'baixo': '3, DOWN', 'esquerda': '4, LEFT',
    'select': 'ESCAPE, BACKSPACE', 'start': 'I, K, TAB, ENTER', 'andar_cima': 'W', 'andar_baixo': 'S',
    'andar_esquerda': 'A', 'andar_direita': 'D', 'analogico_direito': 'SHIFT',
}
CTL_PADRAO_JOGO = {'gow1': {'r1': 'R', 'r2': 'E', 'amuleto': ''}, 'gow2': {'r1': 'E', 'r2': 'R', 'amuleto': 'C'}}
# controle: ação do Vita -> botão físico (de fábrica, cada um é ele mesmo)
CTL_FISICOS = ['CRUZ', 'CIRCULO', 'QUADRADO', 'TRIANGULO', 'L1', 'R1', 'L2', 'R2', 'L3', 'R3', 'SELECT', 'START',
               'CIMA', 'DIREITA', 'BAIXO', 'ESQUERDA']
CTL_ACOES_CONTROLE = ['cruz', 'circulo', 'quadrado', 'triangulo', 'l1', 'r1', 'l2', 'r2', 'l3', 'r3', 'select', 'start',
                      'cima', 'direita', 'baixo', 'esquerda']


def _ctl_ini(jogo):
    if jogo not in CTL_PADRAO_JOGO:
        raise ValueError('jogo desconhecido: %s' % jogo)
    return os.path.join(cfg['data'], 'controles_%s.ini' % jogo)


def _ctl_padrao(jogo):
    tec = dict(CTL_PADRAO, **CTL_PADRAO_JOGO[jogo])
    return {'teclado': {k: [c.strip() for c in v.split(',') if c.strip()] for k, v in tec.items()},
            'controle': {a: a.upper().replace('CIRCULO', 'CIRCULO') for a in CTL_ACOES_CONTROLE}}


def m_controles(a):
    """O mapa em uso (arquivo por cima do padrão) e o padrão, para a tela."""
    jogo = a['jogo']
    padrao = _ctl_padrao(jogo)
    atual = {'teclado': dict(padrao['teclado']), 'controle': dict(padrao['controle'])}
    p = _ctl_ini(jogo)
    if os.path.exists(p):
        secao = ''
        for l in open(p, encoding='utf-8', errors='replace'):
            l = l.strip()
            if not l or l[0] in '#;':
                continue
            if l.startswith('['):
                secao = l[1:l.find(']')]
                continue
            k, _, v = l.partition('=')
            k, v = k.strip().lower(), v.strip()
            if secao == 'teclado' and k in atual['teclado']:
                atual['teclado'][k] = [c.strip().upper() for c in v.split(',') if c.strip()]
            elif secao == 'controle' and k in atual['controle'] and v.upper() in CTL_FISICOS + ['NADA']:
                atual['controle'][k] = v.upper()
    return {'atual': atual, 'padrao': padrao, 'arquivo': p, 'fisicos': CTL_FISICOS}


def m_salvar_controles(a):
    jogo, tec, ctl = a['jogo'], a.get('teclado') or {}, a.get('controle') or {}
    padrao = _ctl_padrao(jogo)
    linhas = ['# feito pelo vitart Settings; apagar o arquivo volta ao padrão', '[teclado]']
    for k in padrao['teclado']:
        v = tec.get(k, padrao['teclado'][k])
        linhas.append('%s = %s' % (k, ', '.join(str(x).upper() for x in v)))
    linhas.append('[controle]')
    for k in CTL_ACOES_CONTROLE:  # a tabela inteira: o runtime tira a ação de onde estava antes de pôr
        v = str(ctl.get(k, padrao['controle'][k])).upper()
        linhas.append('%s = %s' % (k, v if v in CTL_FISICOS else 'NADA'))
    open(_ctl_ini(jogo), 'w', encoding='utf-8', newline='\n').write('\n'.join(linhas) + '\n')
    return m_controles({'jogo': jogo})


def m_ajuda(a):
    p = os.path.join(K.REPO, 'docs', 'modding', 'README.md')
    return open(p, encoding='utf-8').read() if os.path.exists(p) else 'Guia não encontrado: %s' % p


METHODS = {k[2:]: v for k, v in globals().items() if k.startswith('m_')}


def main():
    # importa já, na thread principal: o numpy carregado pela 1a vez numa thread enquanto esta está parada no
    # stdin trava no Windows (medido: o pedido nunca volta)
    import numpy  # noqa: F401
    from PIL import Image  # noqa: F401
    import gxm_tex_dump  # noqa: F401
    import vitart_arte  # noqa: F401
    import vitart_trofeus  # noqa: F401
    send({'ev': 'pronto'})
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except ValueError:
            continue
        rid = req.get('id')

        def run(req=req, rid=rid):
            try:
                send({'id': rid, 'ok': True, 'r': METHODS[req['m']](req.get('a') or {})})
            except Exception as e:  # noqa: BLE001
                traceback.print_exc()
                send({'id': rid, 'ok': False, 'erro': str(e)})
        # pedidos rápidos em threads também: miniaturas e prévias não seguram a lista de mods
        threading.Thread(target=run, daemon=True).start()


if __name__ == '__main__':
    main()
