// teste offline da leitura do controle de Switch (host_input.cpp): relatórios 0x30 e 0x3F montados à mão
//   clang++ -std=c++20 -I runtime/arm -I runtime/vitart tests/switch_pad/teste.cpp -o teste.exe -lhid -lsetupapi
#include <cstdarg>
#include <cstdio>
#include <string>
namespace vt {
void logf(const char *, ...) {}
}
#include "../../runtime/vitart/host_input.cpp"
int main() {
    using namespace hostin;
    int falhas = 0;
    auto checa = [&](const char *n, bool ok) { if (!ok) falhas++, printf("FALHA %s\n", n); };
    std::vector<uint8_t> r(49, 0);
    r[0] = 0x30, r[3] = 0x04, r[4] = 0x02, r[5] = 0x40; // B, +, L
    // esquerdo todo à direita (x 3448) e centro em y; direito no centro
    auto put = [&](int i, int x, int y) { r[i] = x & 0xFF, r[i + 1] = (uint8_t)((x >> 8) | (y & 0xF) << 4), r[i + 2] = (uint8_t)(y >> 4); };
    put(6, 3448, 2048), put(9, 2048, 3448);
    State s;
    nintendo_state(r, s);
    checa("0x30 B = cruz", s.buttons & CROSS);
    checa("0x30 + = start", s.buttons & START);
    checa("0x30 L = L1", s.buttons & L1);
    checa("0x30 só esses", s.buttons == (CROSS | START | L1));
    checa("0x30 lx à direita", s.lx == 255);
    checa("0x30 ry para cima (0)", s.ry == 1 || s.ry == 0);
    std::vector<uint8_t> q(12, 0);
    q[0] = 0x3F, q[1] = 0x02, q[2] = 0x01, q[3] = 2; // A, -, direcional para a direita
    q[4] = 0x00, q[5] = 0x80, q[6] = 0x00, q[7] = 0x80, q[8] = 0x00, q[9] = 0x80, q[10] = 0x00, q[11] = 0x80;
    State t;
    nintendo_state(q, t);
    checa("0x3F A = círculo, - = select, direita", t.buttons == (CIRCLE | SELECT | RIGHT));
    checa("0x3F analógicos no centro", t.lx == 128 && t.ly == 128 && t.rx == 128 && t.ry == 128);
    printf("%d falhas\n", falhas);
    return falhas != 0;
}
