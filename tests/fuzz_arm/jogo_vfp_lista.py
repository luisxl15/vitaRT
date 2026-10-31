"""Lista as instruções VFP/NEON que existem de verdade no código do jogo (codificação única), para o teste
instrução a instrução contra o Unicorn (jogo_vfp_fuzz.py).

    python tests/fuzz_arm/jogo_vfp_lista.py <saída.json> <gow1.elf> [<gow2.elf> ...]

Cada entrada: bytes (hex), texto do Capstone, quantas vezes aparece, um endereço de exemplo e o tipo:
"conta" (só registradores de ponto flutuante/vetor), "mem" (vld/vst/vldr/vstr/vldm/vstm com base em
registrador comum), "nucleo" (vmov/vmrs com registrador comum) ou "fora" (base sp/pc, vmsr: não testável assim).
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'vitarecomp'))
from vitarecomp import module as modmod  # noqa: E402
from vitarecomp.arm import image  # noqa: E402
from vitarecomp.arm import analysis  # noqa: E402

MEM = re.compile(r'^(vld|vst)')
NUCLEO = re.compile(r'\b(r\d+|ip|lr|fp|sb|sl)\b')


def tipo(nome, txt):
    if nome.startswith('vmsr') or 'fpscr' in txt and nome.startswith('vmsr'):
        return 'fora'
    if nome in ('vpush', 'vpop'):
        return 'fora'
    if MEM.match(nome):
        return 'fora' if re.search(r'\[(sp|pc)', txt) or ', sp' in txt.split('{')[0] else 'mem'
    if NUCLEO.search(txt) or nome.startswith('vmrs'):
        return 'nucleo'
    return 'conta'


def main():
    out = {}
    for elf in sys.argv[2:]:
        mod = modmod.load(Path(elf).read_bytes(), Path(elf).name, load_base=0x81000000)
        prog = analysis.analyze(image.from_vita_module(mod))
        n = 0
        for f in prog.functions.values():
            for i in f.insns.values():
                if not i.name.startswith('v') or i.size != 4 or not i.thumb:
                    continue
                txt = f'{i.cs.mnemonic} {i.cs.op_str}'
                k = i.raw.hex()
                e = out.setdefault(k, {'txt': txt, 'n': 0, 'ex': hex(i.addr), 'tipo': tipo(i.cs.mnemonic, txt), 'de': Path(elf).stem})
                e['n'] += 1
                n += 1
        print(f'{elf}: {n} instruções VFP/NEON', file=sys.stderr)
    json.dump(out, open(sys.argv[1], 'w'), indent=0)
    from collections import Counter
    print(len(out), 'codificações únicas', dict(Counter(e['tipo'] for e in out.values())), file=sys.stderr)


if __name__ == '__main__':
    main()
