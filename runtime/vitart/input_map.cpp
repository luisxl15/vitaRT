// controles_<jogo>.ini, o que o Settings grava:
//
//   [teclado]                 ação = teclas, separadas por vírgula; "A+B" = as duas juntas
//   cruz = SPACE
//   circulo = MBUTTON
//   furia = V, SHIFT+MBUTTON
//   andar_cima = W
//   analogico_direito = SHIFT  (segurando, a direção vai pro analógico direito)
//   [controle]                ação = botão físico do controle
//   cruz = CRUZ
//
// sem o arquivo (ou sem uma ação nele) fica o padrão do jogo (game_default_controls). O arquivo é relido quando
// muda: dá pra trocar com o jogo aberto. Combinação apertada esconde a tecla sozinha (SHIFT+MBUTTON não aperta
// também o MBUTTON comum).
#include "input_map.h"
#include "game.h"
#include "vitart.h"

#include <cctype>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <map>
#include <mutex>
#include <string>
#include <vector>
#include <windows.h>

namespace vt::inmap {

namespace {

// ações do Vita: nome no ini -> bits do SceCtrlData (furia = L3+R3, amuleto = L1+R1 no GoW2)
const struct { const char *nome; uint32_t bits; } kAcoes[] = {
    {"cruz", 0x4000}, {"circulo", 0x2000}, {"quadrado", 0x8000}, {"triangulo", 0x1000}, {"l1", 0x400}, {"r1", 0x800},
    {"l2", 0x100}, {"r2", 0x200}, {"l3", 0x2}, {"r3", 0x4}, {"select", 0x1}, {"start", 0x8}, {"cima", 0x10},
    {"direita", 0x20}, {"baixo", 0x40}, {"esquerda", 0x80}, {"furia", 0x6}, {"amuleto", 0xC00},
};
// botões físicos do controle pelo nome (o host_input já entrega na posição do Vita)
const struct { const char *nome; uint32_t bit; } kFisicos[] = {
    {"CRUZ", 0x4000}, {"CIRCULO", 0x2000}, {"QUADRADO", 0x8000}, {"TRIANGULO", 0x1000}, {"L1", 0x400}, {"R1", 0x800},
    {"L2", 0x100}, {"R2", 0x200}, {"L3", 0x2}, {"R3", 0x4}, {"SELECT", 0x1}, {"START", 0x8}, {"CIMA", 0x10},
    {"DIREITA", 0x20}, {"BAIXO", 0x40}, {"ESQUERDA", 0x80}, {"NADA", 0},
};

int vk_do_nome(std::string n) {
    for (char &c : n) c = (char)std::toupper((unsigned char)c);
    if (n.size() == 1 && (std::isalnum((unsigned char)n[0]))) return n[0];
    if (n.size() >= 2 && n[0] == 'F' && std::isdigit((unsigned char)n[1])) {
        const int f = std::atoi(n.c_str() + 1);
        if (f >= 1 && f <= 24) return VK_F1 + f - 1;
    }
    static const std::map<std::string, int> t = {
        {"SPACE", VK_SPACE}, {"ESPACO", VK_SPACE}, {"SHIFT", VK_SHIFT}, {"LSHIFT", VK_LSHIFT}, {"RSHIFT", VK_RSHIFT},
        {"CTRL", VK_CONTROL}, {"LCTRL", VK_LCONTROL}, {"RCTRL", VK_RCONTROL}, {"ALT", VK_MENU}, {"LALT", VK_LMENU},
        {"RALT", VK_RMENU}, {"TAB", VK_TAB}, {"ENTER", VK_RETURN}, {"RETURN", VK_RETURN}, {"ESC", VK_ESCAPE},
        {"ESCAPE", VK_ESCAPE}, {"BACKSPACE", VK_BACK}, {"BACK", VK_BACK}, {"UP", VK_UP}, {"DOWN", VK_DOWN},
        {"LEFT", VK_LEFT}, {"RIGHT", VK_RIGHT}, {"LBUTTON", VK_LBUTTON}, {"RBUTTON", VK_RBUTTON},
        {"MBUTTON", VK_MBUTTON}, {"XBUTTON1", VK_XBUTTON1}, {"XBUTTON2", VK_XBUTTON2}, {"CAPSLOCK", VK_CAPITAL},
        {"INSERT", VK_INSERT}, {"DELETE", VK_DELETE}, {"HOME", VK_HOME}, {"END", VK_END}, {"PAGEUP", VK_PRIOR},
        {"PAGEDOWN", VK_NEXT}, {"NUM0", VK_NUMPAD0}, {"NUM1", VK_NUMPAD1}, {"NUM2", VK_NUMPAD2}, {"NUM3", VK_NUMPAD3},
        {"NUM4", VK_NUMPAD4}, {"NUM5", VK_NUMPAD5}, {"NUM6", VK_NUMPAD6}, {"NUM7", VK_NUMPAD7}, {"NUM8", VK_NUMPAD8},
        {"NUM9", VK_NUMPAD9}, {"COMMA", VK_OEM_COMMA}, {"PERIOD", VK_OEM_PERIOD}, {"MINUS", VK_OEM_MINUS},
        {"PLUS", VK_OEM_PLUS}, {"TILDE", VK_OEM_3}, {"SEMICOLON", VK_OEM_1}, {"SLASH", VK_OEM_2},
        {"LBRACKET", VK_OEM_4}, {"RBRACKET", VK_OEM_6}, {"QUOTE", VK_OEM_7}, {"BACKSLASH", VK_OEM_5},
    };
    auto it = t.find(n);
    return it == t.end() ? 0 : it->second;
}

std::string aparar(const std::string &s) {
    size_t a = s.find_first_not_of(" \t\r\n"), b = s.find_last_not_of(" \t\r\n");
    return a == std::string::npos ? "" : s.substr(a, b - a + 1);
}

using Combo = std::vector<int>; // teclas que precisam estar juntas
struct Mapa {
    std::vector<std::pair<uint32_t, Combo>> botoes; // bits <- combinação
    std::vector<Combo> cima, baixo, esq, dir, roll;
    uint32_t ctl[32] = {};     // botão do jogo <- bit físico (índice do bit físico)
    bool ctl_mudou = false;
};

// "V, SHIFT+MBUTTON" -> combinações
std::vector<Combo> combos(const std::string &v) {
    std::vector<Combo> out;
    size_t i = 0;
    while (i <= v.size()) {
        size_t j = v.find(',', i);
        if (j == std::string::npos) j = v.size();
        const std::string item = aparar(v.substr(i, j - i));
        Combo c;
        size_t k = 0;
        bool ok = !item.empty();
        while (ok && k <= item.size()) {
            size_t p = item.find('+', k);
            if (p == std::string::npos) p = item.size();
            const int vk = vk_do_nome(aparar(item.substr(k, p - k)));
            if (!vk) ok = false;
            c.push_back(vk);
            k = p + 1;
        }
        if (ok && !c.empty()) out.push_back(c);
        i = j + 1;
    }
    return out;
}

void ler_texto(Mapa &m, const std::string &texto, bool padrao) {
    std::string secao;
    size_t i = 0;
    while (i < texto.size()) {
        size_t j = texto.find('\n', i);
        if (j == std::string::npos) j = texto.size();
        std::string l = aparar(texto.substr(i, j - i));
        i = j + 1;
        if (l.empty() || l[0] == '#' || l[0] == ';') continue;
        if (l[0] == '[') {
            secao = l.substr(1, l.find(']') - 1);
            continue;
        }
        const size_t eq = l.find('=');
        if (eq == std::string::npos) continue;
        std::string chave = aparar(l.substr(0, eq));
        for (char &c : chave) c = (char)std::tolower((unsigned char)c);
        const std::string valor = aparar(l.substr(eq + 1));
        if (secao == "teclado") {
            auto set = [&](std::vector<Combo> &dst) { dst = combos(valor); };
            if (chave == "andar_cima") set(m.cima);
            else if (chave == "andar_baixo") set(m.baixo);
            else if (chave == "andar_esquerda") set(m.esq);
            else if (chave == "andar_direita") set(m.dir);
            else if (chave == "analogico_direito") set(m.roll);
            else
                for (const auto &a : kAcoes)
                    if (chave == a.nome) {
                        // a ação lida substitui a do padrão inteira
                        std::erase_if(m.botoes, [&](const auto &b) { return b.first == a.bits; });
                        for (const Combo &c : combos(valor)) m.botoes.push_back({a.bits, c});
                    }
        } else if (secao == "controle") {
            std::string v = valor;
            for (char &c : v) c = (char)std::toupper((unsigned char)c);
            for (const auto &a : kAcoes)
                if (chave == a.nome && a.bits && !(a.bits & (a.bits - 1)))
                    for (const auto &f : kFisicos)
                        if (v == f.nome) {
                            int bit = 0;
                            while (!((a.bits >> bit) & 1)) bit++;
                            // ação 'a' sai quando o físico f está apertado
                            for (uint32_t &x : m.ctl) x &= ~a.bits; // tira a ação de onde estava
                            if (f.bit) {
                                int fb = 0;
                                while (!((f.bit >> fb) & 1)) fb++;
                                m.ctl[fb] |= a.bits;
                            }
                            if (!padrao) m.ctl_mudou = true;
                            (void)bit;
                        }
        }
    }
}

std::mutex g_lock;
Mapa g_mapa;
std::filesystem::file_time_type g_mtime{};
int g_jogo = -1;
uint64_t g_ultimo_teste = 0;

void recarregar_se_preciso() {
    const uint64_t agora = GetTickCount64();
    if (g_jogo == game_id() && agora - g_ultimo_teste < 500) return;
    g_ultimo_teste = agora;
    const std::string arq = data_path() + "/controles_" + game_tag() + ".ini";
    std::error_code ec;
    const auto mt = std::filesystem::last_write_time(arq, ec);
    if (g_jogo == game_id() && (ec ? g_mtime == std::filesystem::file_time_type{} : mt == g_mtime)) return;
    g_jogo = game_id();
    g_mtime = ec ? std::filesystem::file_time_type{} : mt;
    Mapa m;
    for (int b = 0; b < 32; b++) m.ctl[b] = 1u << b; // controle: de fábrica, cada botão é ele mesmo
    ler_texto(m, game_default_controls(), true);
    if (!ec)
        if (FILE *f = fopen(arq.c_str(), "rb")) {
            std::string t;
            char buf[4096];
            size_t n;
            while ((n = fread(buf, 1, sizeof buf, f)) > 0) t.append(buf, n);
            fclose(f);
            ler_texto(m, t, false);
            logf("vitart: controles de %s lidos", arq.c_str());
        }
    g_mapa = std::move(m);
}

bool apertado(const Combo &c) {
    for (int vk : c)
        if (!(GetAsyncKeyState(vk) & 0x8000)) return false;
    return true;
}

} // namespace

Teclado teclado() {
    std::lock_guard<std::mutex> lk(g_lock);
    recarregar_se_preciso();
    const Mapa &m = g_mapa;
    // teclas que fazem parte de uma combinação apertada não valem sozinhas
    std::vector<int> em_combo;
    for (const auto &b : m.botoes)
        if (b.second.size() > 1 && apertado(b.second)) em_combo.insert(em_combo.end(), b.second.begin(), b.second.end());
    auto vale = [&](const Combo &c) {
        if (!apertado(c)) return false;
        if (c.size() == 1)
            for (int vk : em_combo)
                if (vk == c[0]) return false;
        return true;
    };
    auto algum = [&](const std::vector<Combo> &v) {
        for (const Combo &c : v)
            if (vale(c)) return true;
        return false;
    };
    Teclado k;
    for (const auto &b : m.botoes)
        if (vale(b.second)) k.buttons |= b.first;
    k.mx = (algum(m.dir) ? 1 : 0) - (algum(m.esq) ? 1 : 0);
    k.my = (algum(m.baixo) ? 1 : 0) - (algum(m.cima) ? 1 : 0);
    for (const Combo &c : m.roll) // é modificador: vale mesmo dentro de uma combinação (Shift+MBUTTON)
        if (apertado(c)) k.roll = true;
    return k;
}

uint32_t controle(uint32_t fisicos) {
    std::lock_guard<std::mutex> lk(g_lock);
    recarregar_se_preciso();
    if (!g_mapa.ctl_mudou) return fisicos;
    uint32_t out = 0;
    for (int b = 0; b < 32; b++)
        if ((fisicos >> b) & 1) out |= g_mapa.ctl[b];
    return out;
}

} // namespace vt::inmap
