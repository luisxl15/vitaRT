"""Testa, uma a uma, as instruções VFP/NEON que o jogo usa (lista de jogo_vfp_lista.py) contra o Unicorn.

    python tests/fuzz_arm/jogo_vfp_fuzz.py <lista.json> [--tipos conta,nucleo,mem] [--por 150] [-j 4] [--limite N]

Cada programa leva <por> instruções. Antes de cada uma o estado volta ao mesmo ponto (d0-d31, r0-r12, de uma
de 8 sementes com floats especiais), a instrução roda com os próprios bytes do jogo (.inst.w) e o estado
inteiro é despejado (d0-d31, r0-r12, FPSCR, APSR). Então cada instrução é julgada sozinha: uma divergência
não contamina as seguintes. Nas de memória, o registrador base aponta para o meio de um buffer antes.
"""
from __future__ import annotations

import argparse
import json
import random
import re
import shutil
import struct
import subprocess
import sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import run_fuzz_arm as R  # noqa: E402

SPECIAL = [0x00000000, 0x80000000, 0x3f800000, 0xbf800000, 0x7f800000, 0xff800000, 0x7fc00000, 0x7f800001,
           0x00000001, 0x80400000, 0x007fffff, 0x00800000, 0x7f7fffff, 0x40490fdb, 0x4b000000, 0xcf000000,
           0x3eaaaaab, 0x47800000, 0x3f000000, 0xc2c80000, 0x42c80000, 0x3c23d70a]
REGS = {'r%d' % i: i for i in range(13)}
REGS.update({'sb': 9, 'sl': 10, 'fp': 11, 'ip': 12})
PASSO = 256 + 13 * 4 + 8  # bytes por instrução no despejo
BUF = 2048                # buffer das instruções de memória: volta ao original antes de cada uma e entra no despejo
MEM = False               # programas só de memória (--tipos mem): despejo com o buffer
FPSCR_MASK = 0xF7C00000
APSR_MASK = 0  # nenhuma das testadas mexe nos flags (o vmrs APSR_nzcv fica de fora); o valor de antes difere


def base_reg(txt):
    """registradores comuns usados como endereço numa instrução de memória: base e, se houver, o índice"""
    m = re.search(r'\[(\w+)', txt) or re.match(r'\S+\s+(\w+)!?,', txt)  # vldm/vstm: a base vem sem colchetes
    out = [REGS[m.group(1)]] if m and m.group(1) in REGS else []
    m2 = re.search(r'\],\s*(\w+)\s*$', txt)
    if m2 and m2.group(1) in REGS:
        out.append(REGS[m2.group(1)])
    return out


def programa(lista, seed):
    rng = random.Random(seed)
    out = ['.syntax unified', '.fpu neon', '.thumb', '.text', '.globl main', '.type main, %function', '.thumb_func',
           'main:', ' push {r4-r11, lr}', ' vpush {d8-d15}', ' movw r0, #:lower16:fz_ptr', ' movt r0, #:upper16:fz_ptr',
           ' movw r1, #:lower16:fz_dump', ' movt r1, #:upper16:fz_dump', ' str r1, [r0]']
    passo = PASSO + (BUF if MEM else 0)
    for k, (raw, e, s) in enumerate(lista):
        if MEM:  # buffer de volta ao original
            out += [' movw r0, #:lower16:fz_buf0', ' movt r0, #:upper16:fz_buf0', ' movw r1, #:lower16:fz_buf',
                    ' movt r1, #:upper16:fz_buf', f' movw r2, #{BUF // 16}', '1: ldmia r0!, {r3-r6}', ' stmia r1!, {r3-r6}',
                    ' subs r2, #1', ' bne 1b']
        out += [f' movw ip, #:lower16:fz_init{s}', f' movt ip, #:upper16:fz_init{s}',
                ' vldmia ip!, {d0-d15}', ' vldmia ip!, {d16-d31}', ' ldmia ip, {r0-r11}',
                f' movw ip, #{0x1234 + k}', ' movt ip, #0x4000']
        if e['tipo'] == 'mem':
            # todo registrador comum aponta para o meio do buffer (a instrução anda para os dois lados), e o
            # índice de pós-incremento, se houver, vale 16: nada escapa para a pilha se o parser errar a base
            out += [' movw r0, #:lower16:fz_buf+1024', ' movt r0, #:upper16:fz_buf+1024'] + [f' mov r{r}, r0' for r in range(1, 12)] + [' mov ip, r0', ' mov lr, r0']  # o jogo tem vstr [lr]
            for r in base_reg(e['txt'])[1:]:
                out += [f' movs {"ip" if r == 12 else f"r{r}"}, #16']
        h1, h2 = struct.unpack('<HH', bytes.fromhex(raw))
        out.append(f' .inst.w 0x{h1:04x}{h2:04x}   @ {e["txt"]}')
        out += [' push {r0-r12}', ' movw r0, #:lower16:fz_ptr', ' movt r0, #:upper16:fz_ptr', ' ldr r1, [r0]',
                ' vstmia r1!, {d0-d15}', ' vstmia r1!, {d16-d31}', ' mov r2, sp', ' ldmia r2!, {r3-r9}',
                ' stmia r1!, {r3-r9}', ' ldmia r2!, {r3-r8}', ' stmia r1!, {r3-r8}', ' vmrs r3, fpscr', ' mrs r4, apsr',
                ' stmia r1!, {r3, r4}']
        if MEM:  # o buffer depois da instrução
            out += [' movw r2, #:lower16:fz_buf', ' movt r2, #:upper16:fz_buf', f' movw r3, #{BUF // 16}',
                    '2: ldmia r2!, {r4-r7}', ' stmia r1!, {r4-r7}', ' subs r3, #1', ' bne 2b']
        out += [' str r1, [r0]', ' pop {r0-r12}']
    n = len(lista) * passo
    out += [' movw r1, #:lower16:fz_dump', ' movt r1, #:upper16:fz_dump', ' movs r0, #1',
            f' movw r2, #{n & 0xFFFF}', f' movt r2, #{n >> 16}', ' bl g_write',
            ' movs r0, #0', ' vpop {d8-d15}', ' pop {r4-r11, pc}', '.data', '.align 4']
    for s in range(8):
        out.append(f'fz_init{s}:')
        for _ in range(64):
            out.append('.word %d' % (rng.choice(SPECIAL) if rng.random() < 0.4 else rng.randrange(2 ** 32)))
        for _ in range(12):
            out.append('.word %d' % rng.choice([0, 1, 7, 0x80000000, 0xFFFFFFFF, rng.randrange(2 ** 32)]))
    pal = [rng.choice(SPECIAL) if rng.random() < 0.4 else rng.randrange(2 ** 32) for _ in range(BUF // 4)]
    out += ['.align 4', 'fz_buf0:'] + ['.word %d' % w for w in pal]
    out += ['.align 4', 'fz_buf:'] + ['.word %d' % w for w in pal]
    out += ['.align 4', 'fz_ptr:', '.word 0', '.bss', '.align 4', 'fz_dump:', f'.space {n}']
    return '\n'.join(out) + '\n'


def comparar(a, b, lista):
    ruins = []
    passo = PASSO + (BUF if MEM else 0)
    for k, (raw, e, _s) in enumerate(lista):
        x, y = a[k * passo:(k + 1) * passo], b[k * passo:(k + 1) * passo]
        if MEM and x[PASSO:] != y[PASSO:]:
            bx, by = struct.unpack(f'<{BUF // 4}I', x[PASSO:]), struct.unpack(f'<{BUF // 4}I', y[PASSO:])
            dif = [f'buf+{i * 4 - 1024}: unicorn={p:08x} nosso={q:08x}' for i, (p, q) in enumerate(zip(bx, by)) if p != q]
            ruins.append((raw, e, '; '.join(dif[:4])))
            continue
        x, y = x[:PASSO], y[:PASSO]
        if len(x) != PASSO or len(y) != PASSO:
            ruins.append((raw, e, 'despejo curto'))
            continue
        wa, wb = list(struct.unpack('<79I', x)), list(struct.unpack('<79I', y))
        wa[77] &= FPSCR_MASK; wb[77] &= FPSCR_MASK
        wa[78] &= APSR_MASK; wb[78] &= APSR_MASK
        if wa != wb:
            nomes = [f'd{i // 2}.{"lo" if i % 2 == 0 else "hi"}' for i in range(64)] + [f'r{i}' for i in range(13)] + ['FPSCR', 'APSR']
            ruins.append((raw, e, '; '.join(f'{nomes[i]}: unicorn={p:08x} nosso={q:08x}' for i, (p, q) in enumerate(zip(wa, wb)) if p != q)[:300]))
    return ruins


def rodar(args_lote):
    idx, lista = args_lote
    work = R.ROOT / 'build' / ('fuzz_jogo_mem' if MEM else 'fuzz_jogo') / f'p{idx}'
    work.mkdir(parents=True, exist_ok=True)
    (work / 'f.S').write_text(programa(lista, idx))
    if R.build_guest(work / 'f.elf', work / 'f.S', 'thumb', '-O0'):
        p = subprocess.run([R.CLANG, '--target=armv7a-linux-gnueabihf', '-mthumb', '-mfpu=neon', '-c', str(work / 'f.S'), '-o', str(work / 'x.o')], capture_output=True)
        return idx, None, 'montagem falhou: ' + p.stderr.decode()[-300:]
    ref = R.run_reference(work / 'f.elf')
    p = subprocess.run([R.PY, '-P', '-m', 'vitarecomp', 'recomp', '--linux', str(work / 'f.elf'), '-o', str(work / 'gen')],
                       capture_output=True, env={**R.os.environ, 'PYTHONPATH': R.os.environ.get('JOGO_VITARECOMP', str(R.ROOT / 'vitarecomp'))})
    if p.returncode:
        return idx, None, 'recomp falhou: ' + p.stderr.decode()[-300:]
    p = R.build_recompiled(work / f'rc{R.EXE}', work / 'gen')
    if p.returncode:
        return idx, None, 'C falhou: ' + p.stderr.decode()[-300:]
    got = subprocess.run([str(work / f'rc{R.EXE}')], capture_output=True, timeout=120)
    if ref.returncode != 0:
        return idx, None, f'referência caiu ({ref.returncode}): {ref.stderr.decode()[-200:]}'
    ruins = comparar(ref.stdout, got.stdout, lista)
    if not ruins and got.returncode == 0:
        shutil.rmtree(work)
    return idx, ruins, None if got.returncode == 0 else f'nosso saiu com {got.returncode}'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('lista')
    ap.add_argument('--tipos', default='conta,nucleo')
    ap.add_argument('--por', type=int, default=150)
    ap.add_argument('-j', type=int, default=4)
    ap.add_argument('--limite', type=int, default=0)
    ap.add_argument('--saida', default=None)
    ap.add_argument('--rep', type=int, default=3, help='estados de entrada diferentes por instrução')
    a = ap.parse_args()
    tipos = set(a.tipos.split(','))
    global MEM
    MEM = tipos == {'mem'}
    todas = [(k, e) for k, e in json.load(open(a.lista)).items() if e['tipo'] in tipos and not e['txt'].startswith('vmrs apsr') and not re.search(r'^\S+\s+sp\b|\[(sp|pc)', e['txt'])]  # base sp (vpush disfarçado) ou pc: fora
    todas.sort(key=lambda kv: -kv[1]['n'])  # as mais usadas primeiro
    if a.limite:
        todas = todas[:a.limite]
    # cada instrução de novo com outra semente: com uma só, a+b e a-b podem dar igual (b = 0)
    todas = [(k, e, (i * 3 + r * 5) % 8) for i, (k, e) in enumerate(todas) for r in range(a.rep)]
    lotes = [(i, todas[i * a.por:(i + 1) * a.por]) for i in range((len(todas) + a.por - 1) // a.por)]
    print(f'{len(todas)} instruções em {len(lotes)} programas', flush=True)
    ruins, erros = [], []
    with ThreadPoolExecutor(a.j) as ex:
        for idx, r, err in ex.map(rodar, lotes):
            if err:
                erros.append((idx, err))
            if r:
                ruins += r
            print(f'  programa {idx}: {len(r or [])} divergências{" | " + err if err else ""}', flush=True)
    vistos = {}
    for raw, e, d in ruins:  # a mesma instrução pode divergir em mais de uma semente: uma linha basta
        vistos.setdefault(raw, (raw, e, d))
    ruins = list(vistos.values())
    por_op = Counter(e['txt'].split()[0] for _, e, _ in ruins)
    print(f'\n{len(ruins)} instruções divergem; por mnemônico: {dict(por_op.most_common(40))}')
    for raw, e, d in sorted(ruins, key=lambda t: -t[1]['n'])[:60]:
        print(f'  {e["txt"]:42s} x{e["n"]:<5d} {e["de"]} {e["ex"]}  {d}')
    if a.saida:
        json.dump([{'raw': raw, **e, 'diff': d} for raw, e, d in ruins], open(a.saida, 'w'), indent=1)
    for idx, err in erros[:10]:
        print('erro no programa', idx, err)


if __name__ == '__main__':
    main()
