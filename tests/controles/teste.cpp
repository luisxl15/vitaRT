// teste offline do input_map: o padrão (game_default_controls) tem de dar os mesmos botões da tabela antiga do
// gow_profile.cpp para cada tecla sozinha e com Shift, nos dois jogos; e um controles_<jogo>.ini tem de valer.
//   clang++ -std=c++20 -I runtime/vitart tests/controles/teste.cpp -o teste.exe && teste.exe
#include <windows.h>
#include <set>
static std::set<int> g_down;
static SHORT fake_gaks(int vk) {
    if (vk == VK_SHIFT && (g_down.count(VK_LSHIFT) || g_down.count(VK_RSHIFT))) return (SHORT)0x8000;
    return g_down.count(vk) ? (SHORT)0x8000 : 0;
}
#define GetAsyncKeyState fake_gaks
#include <cstdarg>
#include <cstdio>
#include <string>

namespace vt {
static int g_game = 1;
static std::string g_dir = ".";
int game_id() { return g_game; }

std::string data_path() { return g_dir; }
void logf(const char *fmt, ...) {
    va_list a;
    va_start(a, fmt);
    vprintf(fmt, a);
    va_end(a);
    printf("\n");
}
const char *game_default_controls();
} // namespace vt

#include "../../runtime/vitart/input_map.cpp"

namespace vt {
// a tabela antiga (gow_profile.cpp antes do input_map)
uint32_t antiga(bool g2) {
    auto down = [](int vk) { return fake_gaks(vk) != 0; };
    const struct { int vk; uint32_t bit; } map[] = {
        {VK_SPACE, 0x4000}, {VK_LBUTTON, 0x8000}, {VK_RBUTTON, 0x1000}, {'F', 0x2000}, {'Q', 0x400},
        {VK_LCONTROL, 0x100}, {'E', g2 ? 0x800u : 0x200u}, {'R', g2 ? 0x200u : 0x800u}, {'V', 0x6},
        {'1', 0x10}, {'2', 0x20}, {'3', 0x40}, {'4', 0x80}, {VK_UP, 0x10}, {VK_RIGHT, 0x20},
        {VK_DOWN, 0x40}, {VK_LEFT, 0x80}, {VK_ESCAPE, 0x1}, {VK_BACK, 0x1}, {'I', 0x8}, {'K', 0x8},
        {VK_TAB, 0x8}, {VK_RETURN, 0x8}, {'C', g2 ? 0xC00u : 0u},
    };
    uint32_t b = 0;
    for (auto &m : map)
        if (down(m.vk)) b |= m.bit;
    if (down(VK_MBUTTON)) b |= down(VK_SHIFT) ? 0x6u : 0x2000u;
    return b;
}
} // namespace vt

#include "../../games/gow/gow_profile.cpp"

int main() {
    using namespace vt;
    int falhas = 0, casos = 0;
    for (int g = 1; g <= 2; g++) {
        g_game = g;
        inmap::g_jogo = -1;
        for (int vk = 1; vk < 256; vk++)
            for (int sh = 0; sh < 2; sh++) {
                if (vk == VK_SHIFT || vk == VK_LSHIFT || vk == VK_RSHIFT) continue;
                g_down.clear();
                g_down.insert(vk);
                if (sh) g_down.insert(VK_LSHIFT);
                const inmap::Teclado t = inmap::teclado();
                const uint32_t a = antiga(g == 2);
                const int mx = (vk == 'D') - (vk == 'A'), my = (vk == 'S') - (vk == 'W');
                casos++;
                if (t.buttons != a || t.mx != mx || t.my != my || t.roll != (sh != 0)) {
                    if (falhas++ < 10)
                        printf("FALHA gow%d tecla 0x%02x shift %d: novo %04x (%d,%d,%d) antigo %04x\n", g, vk, sh, t.buttons, t.mx,
                               t.my, (int)t.roll, a);
                }
            }
    }
    // arquivo do jogador: pular no J, andar no setas IJKL? (só confere que vale e que o resto segue o padrão)
    g_game = 1;
    FILE *f = fopen("controles_gow1.ini", "w");
    fprintf(f, "[teclado]\ncruz = J, XBUTTON1\nandar_cima = UP\n[controle]\ncruz = CIRCULO\ncirculo = CRUZ\n");
    fclose(f);
    inmap::g_jogo = -1;
    auto checa = [&](const char *nome, bool ok) {
        casos++;
        if (!ok) falhas++, printf("FALHA %s\n", nome);
    };
    g_down = {'J'};
    checa("J = cruz", inmap::teclado().buttons == 0x4000);
    g_down = {VK_SPACE};
    checa("espaço não pula mais", inmap::teclado().buttons == 0);
    g_down = {VK_UP};
    checa("UP anda (e ainda é o direcional)", inmap::teclado().my == -1);
    g_down = {'Q'};
    checa("Q segue L1", inmap::teclado().buttons == 0x400);
    checa("controle: cruz física vira círculo", inmap::controle(0x4000) == 0x2000);
    checa("controle: círculo físico vira cruz", inmap::controle(0x2000) == 0x4000);
    checa("controle: L1 continua", inmap::controle(0x400) == 0x400);
    remove("controles_gow1.ini");
    printf("%d casos, %d falhas\n", casos, falhas);
    return falhas != 0;
}
