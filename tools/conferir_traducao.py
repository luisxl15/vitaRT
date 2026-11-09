"""Confere uma tradução do MSGS_TXT contra o texto original do jogo.

    python tools/conferir_traducao.py <original.txt> <traducao.txt>

Para cada mensagem (*N*): a tradução tem de ter as mesmas mensagens, as mesmas marcas entre colchetes ([XButton],
[*1]...) na mesma quantidade, o mesmo número de páginas (----) e as linhas de código iguais (W1H, S1, 0, EM20...: o
menu de Power Up e o de Tesouros leem essas linhas). Avisa também de linha bem mais longa que a maior do original
(o texto pode sair da caixa) e de letra que a fonte do jogo não tem.
"""
import collections
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vitart_modkit import FONT_OK  # noqa: E402

MSG = re.compile(r'^\*(\d+)\*[HT]?\s*$')
CODIGO = re.compile(r'^(?:[A-Z]{1,2}\d{0,2}H?|0|X|[A-Z]{1,2}\d{2})$')  # W1H, S1, EM20, HM17, GM24, E, EG, 0, X


def mensagens(p):
    t = open(p, 'rb').read().split(b'\0')[0].decode('utf-8').lstrip('﻿').replace('\r', '')
    out, ordem, cur = {}, [], None
    for line in t.split('\n'):
        if line.startswith('//'):
            continue
        m = MSG.match(line)
        if m:
            cur = m.group(1)
            out[cur] = []
            ordem.append(cur)
        elif cur is not None and line != '':
            out[cur].append(line)
    return out, ordem


def main():
    en, ordem = mensagens(sys.argv[1])
    tr, _ = mensagens(sys.argv[2])
    erros, avisos = [], []
    glifos = collections.Counter()
    for k in ordem:
        if k not in tr:
            erros.append('*%s* falta' % k)
            continue
        a, b = en[k], tr[k]
        ma = collections.Counter(re.findall(r'\[[^\]]*\]', ' '.join(a)))
        mb = collections.Counter(re.findall(r'\[[^\]]*\]', ' '.join(b)))
        if ma != mb:
            erros.append('*%s* marcas diferentes: %s -> %s' % (k, dict(ma - mb), dict(mb - ma)))
        if a.count('----') != b.count('----'):
            erros.append('*%s* páginas: %d -> %d' % (k, a.count('----'), b.count('----')))
        ca = [x for x in a if CODIGO.match(x)]
        cb = [x for x in b if CODIGO.match(x)]
        if ca != cb:
            erros.append('*%s* linhas de código: %s -> %s' % (k, ca, cb))
        if any(x.startswith('*') for x in a) != any(x.startswith('*') for x in b):
            erros.append('*%s* a opção marcada com * sumiu' % k)
        larg = max((len(re.sub(r'\[[^\]]*\]', 'XX', x)) for x in a), default=0)
        for x in b:
            n = len(re.sub(r'\[[^\]]*\]', 'XX', x))
            if larg >= 20 and n > larg * 1.3 and n > 52:
                avisos.append('*%s* linha longa (%d, original %d): %s' % (k, n, larg, x))
        for x in b:
            glifos.update(c for c in x if c not in FONT_OK)
    for k in tr:
        if k not in en:
            avisos.append('*%s* não existe no original' % k)
    if glifos:
        avisos.append('letras sem glifo (o kit troca pela mais próxima): ' + ' '.join('%s x%d' % kv for kv in sorted(glifos.items())))
    for e in erros:
        print('ERRO', e)
    for w in avisos:
        print('aviso', w)
    print('%d mensagens, %d erros, %d avisos' % (len(ordem), len(erros), len(avisos)))
    sys.exit(1 if erros else 0)


if __name__ == '__main__':
    main()
