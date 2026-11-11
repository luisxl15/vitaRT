"""Rótulos fixos (Static) dos menus do GoW1 traduzidos: menu principal (FLP_Shell) e pausa/HUD (FLP_HUD).

O texto dos menus do GoW1 não está no MSGS: são rótulos estáticos do FLP, com os glifos já escolhidos. A tradução
fica em <tradução>/fontes/rotulos_gow1.tsv, uma linha por rótulo de uma linha só:

    FLP_HUD<TAB>57<TAB>Opções

(o registro FLP e o índice do rótulo; só o texto traduzido, nada do original). tools/gow_menu_mod.py aplica com
--rotulos antes do menu do vitart, no FLP inglês (o francês e o espanhol oficiais têm os deles).

Alinhamento: o rótulo novo mantém o centro (se o original estava centrado na origem do clipe), a borda esquerda
(x = 0, os "= Voltar" ao lado do ícone) ou a borda direita (os das linhas de opções, colados ao valor).
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
    n = 0
    for i, texto in sorted(tabela.items()):
        if i >= len(f.statics):
            continue
        st = f.statics[i]
        if len(st.cmds) != 1 or 'font' not in st.cmds[0]:
            continue  # só os de uma linha (os de várias linhas ficam para depois)
        c0 = st.cmds[0]
        chave = (c0['font'], c0['scale'])
        texto = gow_menu_i18n.para_fonte(texto, 'gow1', lang)
        glyphs = []
        for ch in texto:
            g = font.cmap[ord(ch)] if ord(ch) < len(font.cmap) else -1
            if g < 0:
                continue
            w = tab.get(chave, {}).get(g)
            if w is None:
                w = round(prop[g] * c0['scale']) if g in prop else round(font.widths[g] * 0.73 * c0['scale'] / 720)
            glyphs.append((g, w))
        if not glyphs:
            continue
        w_ref = sum(w for _, w in c0['glyphs'])
        w_new = sum(w for _, w in glyphs)
        x = struct.unpack_from('<h', st.h, 0x10)[0]
        if x == 0:
            nx = 0                                   # colado ao ícone, à esquerda
        elif abs(x + w_ref / 2) <= max(60, w_ref * 0.12):
            nx = -(w_new // 2)                       # centrado
        else:
            nx = x + w_ref - w_new                   # borda direita
        struct.pack_into('<h', st.h, 0x10, max(-32768, min(32767, nx)))
        st.cmds = [dict(c0, glyphs=glyphs)]
        n += 1
    return n
