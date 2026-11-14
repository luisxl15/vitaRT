"""Rótulos fixos (Static) dos menus do GoW1 traduzidos: menu principal (FLP_Shell) e pausa/HUD (FLP_HUD).

O texto dos menus do GoW1 não está no MSGS: são rótulos estáticos do FLP, com os glifos já escolhidos. A tradução
fica em <tradução>/fontes/rotulos_gow1.tsv, uma linha por rótulo de uma linha só:

    FLP_HUD<TAB>57<TAB>Opções

(o registro FLP e o índice do rótulo; só o texto traduzido, nada do original). tools/gow_menu_mod.py aplica com
--rotulos antes do menu do vitart, no FLP inglês (o francês e o espanhol oficiais têm os deles).

Alinhamento: o rótulo novo mantém o centro (se o original estava centrado na origem do clipe), a borda esquerda
(os "= Voltar", ao lado do ícone) ou a borda direita (os das linhas de opções, colados ao valor).

Rótulos de várias linhas (descrições das melhorias, mensagens de fim de jogo, tutoriais): as linhas vêm separadas
por "|" e podem ser mais ou menos que as do original (as que sobram seguem o espaçamento das últimas). Cada linha é
centrada no mesmo eixo das originais (ou fica na mesma borda esquerda, se o original era alinhado à esquerda). Onde o
original reserva espaço para um ícone (o botão, o orbe, que são objetos à parte em posição fixa), a tradução põe "@":
a linha é deslocada para o espaço cair exatamente onde o ícone fica.
"""
import struct

import flp
import gow_menu_i18n


def ler(path):
    out = {}
    for line in open(path, encoding='utf-8'):
        f = line.rstrip('\r\n').split('\t')
        if len(f) >= 3 and not f[0].startswith('#') and f[1].isdigit():
            out.setdefault(f[0], {})[int(f[1])] = f[2]
    return out


def _avancos(f):
    """(fonte, escala) -> {glifo: avanço} medido nos rótulos do próprio FLP, e o avanço por unidade de escala."""
    from collections import Counter, defaultdict
    por = defaultdict(lambda: defaultdict(Counter))
    rel = defaultdict(Counter)
    for st in f.statics:
        cur = None
        for c in st.cmds:
            if 'font' in c:
                cur = (c['font'], c['scale'])
            if cur is None:
                continue
            for g, w in c['glyphs']:
                por[cur][g][w] += 1
                if cur[1]:
                    rel[g][round(w * 1000 / cur[1])] += 1
    tab = {k: {g: c.most_common(1)[0][0] for g, c in v.items()} for k, v in por.items()}
    proporcao = {g: c.most_common(1)[0][0] / 1000 for g, c in rel.items()}
    return tab, proporcao


def aplicar(f, tabela, lang):
    """Troca o texto dos rótulos de uma linha listados em tabela {índice: texto}. Devolve quantos trocou."""
    font = f.fonts[0]
    tab, prop = _avancos(f)

    def glifos(texto, chave):
        out = []
        for ch in texto:
            g = font.cmap[ord(ch)] if ord(ch) < len(font.cmap) else -1
            if g < 0:
                continue
            w = tab.get(chave, {}).get(g)
            if w is None:
                w = round(prop[g] * chave[1]) if g in prop else round(font.widths[g] * 0.73 * chave[1] / 720)
            out.append((g, w))
        return out

    n = 0
    for i, texto in sorted(tabela.items()):
        if i >= len(f.statics):
            continue
        st = f.statics[i]
        if not st.cmds or 'font' not in st.cmds[0]:
            continue
        if len(st.cmds) > 1 or '|' in texto:
            n += _varias_linhas(f, st, texto, lang, glifos)
            continue
        c0 = st.cmds[0]
        chave = (c0['font'], c0['scale'])
        texto = gow_menu_i18n.para_fonte(texto, 'gow1', lang)
        glyphs = glifos(texto, chave)
        if not glyphs:
            continue
        w_ref = sum(w for _, w in c0['glyphs'])
        w_new = sum(w for _, w in glyphs)
        x = struct.unpack_from('<h', st.h, 0x10)[0]
        if x == 0 or texto.startswith('='):
            nx = x                                   # colado ao ícone ("= Voltar"), à esquerda
        elif abs(x + w_ref / 2) <= max(60, w_ref * 0.12):
            nx = -(w_new // 2)                       # centrado
        else:
            nx = x + w_ref - w_new                   # borda direita
        struct.pack_into('<h', st.h, 0x10, max(-32768, min(32767, nx)))
        st.cmds = [dict(c0, glyphs=glyphs)]
        n += 1
    return n


def _varias_linhas(f, st, texto, lang, glifos):
    """Rótulo de várias linhas: cada comando com y próprio é uma linha (ver o docstring do módulo). 1 se trocou."""
    linhas = []  # (chave da fonte, x, y, largura, texto do original)
    chave = None
    for k, c in enumerate(st.cmds):
        if 'font' in c:
            chave = (c['font'], c['scale'])
        if k and not (c['flags'] & 1):
            return 0  # comando que continua a linha anterior (troca de fonte no meio): não tratado
        linhas.append([chave, c.get('x', 0) or 0, c.get('y', 0) or 0, sum(w for _, w in c['glyphs']), c['glyphs']])
    novas = texto.split('|')
    # alinhamento: centros iguais (centrado num eixo) ou bordas esquerdas iguais
    centros = [x + w / 2 for _, x, _, w, _ in linhas]
    wmax = max(w for *_, w, _ in linhas)
    tol = max(60, wmax * 0.06)
    centrado = max(centros) - min(centros) <= tol * 2
    eixo = sum(centros) / len(centros)
    esquerda = min(x for _, x, *_ in linhas)
    font = f.fonts[0]
    sp = font.cmap[32] if 32 < len(font.cmap) else -1
    cmds = []
    for k, t in enumerate(novas):
        if k < len(linhas):
            chave, xo, y, wo, go = linhas[k]
        else:  # linha a mais: o espaçamento das duas últimas
            passo = linhas[-1][2] - linhas[-2][2] if len(linhas) > 1 else 460
            chave, xo, y, wo, go = linhas[-1][0], 0, linhas[-1][2] + passo * (k - len(linhas) + 1), 0, []
        x = None
        if '@' in t and k < len(linhas):
            # o espaço do ícone: a mesma sequência de espaços do original, no mesmo lugar
            gi = [j for j, (g, _) in enumerate(go) if g == sp]
            run, best = [], []
            for j in gi:
                run = run + [j] if run and run[-1] == j - 1 else [j]
                if len(run) > len(best):
                    best = run
            if len(best) >= 2:
                antes_o = sum(w for _, w in go[:best[0]])
                antes, depois = t.split('@', 1)
                ga = glifos(gow_menu_i18n.para_fonte(antes, 'gow1', lang), chave)
                gl = ga + [go[j] for j in best] + glifos(gow_menu_i18n.para_fonte(depois, 'gow1', lang), chave)
                x = xo + antes_o - sum(w for _, w in ga)
        if x is None:
            gl = glifos(gow_menu_i18n.para_fonte(t.replace('@', '   '), 'gow1', lang), chave)
            w = sum(w for _, w in gl)
            x = round(eixo - w / 2) if centrado else esquerda
        c = {'flags': 0x03, 'x': max(-32768, min(32767, x)), 'y': y, 'glyphs': gl}
        if k == 0:
            c = dict(st.cmds[0], x=c['x'], y=y, glyphs=gl)
            c['flags'] = st.cmds[0]['flags'] | 0x03
        elif k < len(st.cmds) and 'font' in st.cmds[k]:
            c = dict(st.cmds[k], x=c['x'], y=y, glyphs=gl)
            c['flags'] = st.cmds[k]['flags'] | 0x03
        elif k < len(st.cmds) and 'color' in st.cmds[k]:
            c['color'] = st.cmds[k]['color']
            c['flags'] |= 0x04
        cmds.append(c)
    st.cmds = cmds
    return 1
