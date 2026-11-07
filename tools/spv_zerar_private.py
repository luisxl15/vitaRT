"""Zera os registradores dos shaders já traduzidos (cache de SPIR-V do vitart), sem precisar do .gxp de origem.

    python tools/spv_zerar_private.py <pasta com .spv> [...] [--conferir]

O tradutor (vitarecomp/usse) guarda os bancos do USSE em arrays Private sem valor inicial. Registrador lido antes
de ser escrito é indefinido no Vulkan: a NVIDIA entrega zero (e o jogo saía certo por sorte), o compilador da AMD
aproveita o "indefinido" e sai lixo -> vértices esticados e cores erradas (RX 9070 XT). Aqui cada OpVariable
Private sem inicializador ganha um OpConstantNull do tipo dela, igual ao que o tradutor passou a emitir. Arquivo
já corrigido fica como está. --conferir roda o spirv-val em cada arquivo mudado.
"""
import glob
import os
import struct
import subprocess
import sys

OP_TYPE_POINTER, OP_VARIABLE, OP_CONSTANT_NULL = 32, 59, 46
SC_PRIVATE = 6
SPIRV_VAL = os.path.join(os.environ.get("VULKAN_SDK", "C:/VulkanSDK/latest"), "Bin", "spirv-val.exe")


def zerar(data):
    """SPIR-V novo, ou None se não há o que mudar."""
    if len(data) < 20 or len(data) % 4:
        return None
    w = list(struct.unpack("<%dI" % (len(data) // 4), data))
    if w[0] != 0x07230203:
        return None
    bound = w[3]
    pointee = {}
    out, i, mudou = w[:5], 5, False
    while i < len(w):
        n, op = w[i] >> 16, w[i] & 0xFFFF
        if n == 0:
            return None
        ins = w[i:i + n]
        if op == OP_TYPE_POINTER:
            pointee[ins[1]] = ins[3]
        if op == OP_VARIABLE and n == 4 and ins[3] == SC_PRIVATE and ins[1] in pointee:
            null = bound
            bound += 1
            out += [(3 << 16) | OP_CONSTANT_NULL, pointee[ins[1]], null]
            ins = [(5 << 16) | OP_VARIABLE, ins[1], ins[2], ins[3], null]
            mudou = True
        out += ins
        i += n
    if not mudou:
        return None
    out[3] = bound
    return struct.pack("<%dI" % len(out), *out)


def main():
    conferir = "--conferir" in sys.argv
    pastas = [a for a in sys.argv[1:] if not a.startswith("--")]
    mudados = iguais = ruins = 0
    for pasta in pastas:
        for f in sorted(glob.glob(os.path.join(pasta, "*.spv"))):
            novo = zerar(open(f, "rb").read())
            if novo is None:
                iguais += 1
                continue
            tmp = f + ".novo"
            open(tmp, "wb").write(novo)
            if conferir:
                r = subprocess.run([SPIRV_VAL, tmp], capture_output=True)
                if r.returncode:
                    print("inválido:", f, r.stderr.decode(errors="replace")[:200])
                    os.remove(tmp)
                    ruins += 1
                    continue
            os.remove(tmp)
            with open(f, "r+b") as fh:  # no lugar: a pasta do jogo é hard link deste cache (montar_jogo.py)
                fh.write(novo)
                fh.truncate()
            mudados += 1
    print("%d corrigidos, %d já estavam, %d recusados pelo spirv-val" % (mudados, iguais, ruins))


if __name__ == "__main__":
    main()
