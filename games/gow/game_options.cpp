// Opções do PC dentro do menu de pausa do God of War 1 (Options > HD Textures / PS2 Audio / Resolution /
// Frame Rate).
//
// O menu é o FLP do próprio jogo, modificado por tools/gow_menu_mod.py (servido por cima do psarc, ver
// hle_io.cpp). Ida e volta:
//   motor -> menu: uma palavra de estado na variável PS2_Cheat, que o código do jogo exporta (só leitura
//     para os scripts) a partir do campo +0x2bc do objeto de opções (ponteiro global em 0x812a681c,
//     registro em sub_81014640); nada mais no jogo usa esse campo e o save não o grava. Os scripts do
//     menu decodificam a palavra para mostrar os valores ao abrir a página.
//   menu -> motor: os scripts mandam fscommand 'FSCommand:VT_<opção>_<valor>'. O tratador de FSCommand do
//     jogo (sub_810e4072) começa com strncmp(comando, "FSCommand:", 10), uma chamada de import; o vitart
//     observa essa chamada e lê o comando. (As variáveis do PS2 que sobraram no Vita não servem: as
//     graváveis têm tratadores no jogo -- SoundMode reconfigura o som e esgotou a memória de vídeo,
//     WideScreen mexe na proporção -- e a PS2_Cheat é só de leitura.)
//
// Palavra de estado: 0x10000 | textura | áudio << 2 | resolução << 4 | fps << 7 | vsync << 9 | QTE automático << 10 |
// contador de FPS << 11 | modo de exibição << 12 (sem bordas) | cheats: vida infinita << 13, magia infinita << 14, fúria
// infinita << 15 | FPS medidos << 17 (0 com o contador desligado; o clipe do contador no HUD mostra esse número). As alternâncias têm um bit (0 Off, 1 On). Texturas e áudio: 1 Off, 2 On, 3 indisponível. Resolução: 1..4
// (escala interna). FPS: 1 = 30, 2 = 60, 3 = máximo. As escolhas ficam em <dados>/vitart_options.ini.
#include "vitart.h"
#include <algorithm>
#include <cmath>
#include <vector>
#include <chrono>
#include <filesystem>
#include <tuple>
#include "gxm_vk.h"

#include <cstdio>
#include <cstdlib>
#include <atomic>
#include <cstring>
#include <string>

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>

namespace vt {
int game_id(); // abaixo: 1 = GoW1, 2 = GoW2
int trophy_unlock_all(); // hle_sys.cpp: cheat "Unlock All Trophies"
void enemy_hp_tick(int game); // enemy_hp.cpp: barras de vida dos inimigos
std::string mods_dir_for(const std::string &psarc_name); // hle_io.cpp: pasta dos mods
std::vector<std::string> mods_hot_apply();               // hle_io.cpp: liga/desliga os mods com o jogo rodando

void texpack_set_enabled(bool on);
bool texpack_available();
void ps2audio_set_enabled(bool on);
bool ps2audio_available();
void display_set_fps60(bool on);
void display_set_fps_target(uint32_t fps);
void display_set_fixed_step_addr(uint32_t a);
void display_set_in_menu(bool on); // hle_sys.cpp: fora da gameplay o ritmo fica em 60 FPS
bool input_kbm_active(); // hle_sys.cpp: o último controle usado foi o teclado/mouse
void kbm_icons_start();

namespace {

constexpr uint32_t kNameWide = 0x811f036c;    // "WideScreen" (confere que o módulo é o gow1)
// Canal com o menu, por jogo: objeto de opções (ponteiro global e vtable + 8), campo da palavra de estado e
// a chamada de strncmp do tratador de FSCommand com o endereço de "FSCommand:".
//   GoW1: PS2_Cheat (+0x2bc, só leitura para os scripts, registrada em sub_81014640).
//   GoW2: não tem Cheat; PS2_OverUnder (+0x3e0, o modo 3D acima/abaixo do PS3, sem uso no Vita). Objeto
//     criado em 0x8106c49e (construtor sub_81016fe0, vtable 0x8122e048), ponteiro em 0x812cb1b8; tratador de
//     FSCommand em 0x8111669e chamando strncmp (stub 0x811f5510) com "FSCommand:" em 0x8121e8d0.
struct OptProfile {
    uint32_t optr, vtbl, field, strncmp_stub, fs_prefix;
};
constexpr OptProfile kOptGow1{0x812a681c, 0x8120c534, 0x2bc, 0x811d1a70, 0x811fbdf4};
constexpr OptProfile kOptGow2{0x812cb1b8, 0x8122e050, 0x3e0, 0x811f5510, 0x8121e8d0};
const OptProfile *opt_profile();
struct Options {
    bool tex = true, audio = true, counter = false, borderless = false;
    uint32_t fps = 1; // 1 = 30, 2 = 60, 3 = máximo (taxa do monitor, sem acelerar o jogo)
    bool vsync = true; // desligado: sem limite de quadros e sem esperar o vblank
    uint32_t scale = 0; // 0 = automática pelo monitor
    bool auto_qte = false; // QTE automático (game_qte_auto)
    bool inf_health = false, inf_magic = false, inf_rage = false; // cheats (cheats_tick)
    bool hp_bars = true; // barras de vida dos inimigos (enemy_hp.cpp)
    uint32_t aspecto = 1; // proporção da tela: 1 Auto (a do monitor), 2 16:9, 3 16:10, 4 21:9, 5 32:9, 6 4:3
};
// proporção de cada escolha do menu (1 = Auto, pelo monitor); nomes do ini na mesma ordem
const float kAspecto[] = {0.f, 0.f, 16.f / 9.f, 1.6f, 64.f / 27.f, 32.f / 9.f, 4.f / 3.f};
const char *kAspectoNome[] = {"", "auto", "16:9", "16:10", "21:9", "32:9", "4:3"};
Options g_opt;
// Pedidos vindos do menu (thread do jogo), aplicados no próximo quadro: 0 = nenhum.
std::atomic<uint32_t> g_req_ehp{0}, g_req_asp{0};
std::atomic<uint32_t> g_req_tex{0}, g_req_aud{0}, g_req_res{0}, g_req_fps{0}, g_req_cnt{0}, g_req_dsp{0}, g_req_vsync{0}, g_req_qte{0},
    g_req_hp{0}, g_req_mp{0}, g_req_rage{0}, g_req_trophy{0}, g_req_restart{0};
// Carregador de mods (hle_io.cpp, docs/modding/README.md): mod_<id>=0/1 no ini (vale ao reiniciar). O menu lista os mods
// de mods/modlist.tsv deste jogo pelo índice (moda..modp = 0..15).
std::vector<std::pair<std::string, bool>> g_mods; // (id, ligado), todos os mod_* do ini
std::atomic<uint32_t> g_req_mod[16];
std::vector<std::string> menu_mods(int game) { // ids na ordem do menu
    std::vector<std::string> out;
    if (FILE *f = fopen((mods_dir_for("") + "/modlist.tsv").c_str(), "r")) {
        char line[1024];
        while (fgets(line, sizeof line, f)) {
            char g[16], id[128];
            unsigned idx = 0;
            if (sscanf(line, "%15s %u %127s", g, &idx, id) == 3 && idx < 16 && !std::strcmp(g, game == 1 ? "gow1" : "gow2")) {
                if (out.size() <= idx) out.resize(idx + 1);
                out[idx] = id;
            }
        }
        fclose(f);
    }
    return out;
}
bool mod_on(const std::string &id) {
    for (auto &[k, v] : g_mods)
        if (k == id) return v;
    return false;
}
void set_mod(const std::string &id, bool on) {
    for (auto &[k, v] : g_mods)
        if (k == id) return void(v = on);
    g_mods.emplace_back(id, on);
}

std::string ini_path() { return data_path() + "/vitart_options.ini"; }
std::string g_iso; // ISO do PS2 lembrada (o iniciador a passa em VITART_PS2_AUDIO)
// Renderizador: "auto" (Vulkan, e Direct3D 11 se não houver Vulkan), "vulkan" ou "d3d11". Vale ao abrir o jogo
// (renderer_choice, lido antes das outras opções, que só carregam no primeiro quadro).
std::string g_renderer = "auto";
std::string ini_value(const char *line, size_t skip) {
    std::string v = line + skip;
    while (!v.empty() && (unsigned char)v.back() <= 32) v.pop_back();
    return v;
}

void save() {
    std::string iso = g_iso;
    if (const char *e = getenv("VITART_PS2_AUDIO"); e && *e) iso = e;
    // o que não é do menu de pausa fica como está: as opções do Settings.exe (console=, log=, texdump=) e a API, que
    // o Settings pode ter trocado com o jogo aberto (vale na próxima abertura)
    std::vector<std::string> alheias;
    if (FILE *f = fopen(ini_path().c_str(), "r")) {
        static const char *nossas[] = {"#", "hd_textures=", "ps2_audio=", "resolution=", "fps=", "vsync=", "fps_counter=",
                                       "borderless=", "auto_qte=", "cheat_", "enemy_health_bars=", "mod_", "ps2_iso=", "aspect="};
        char line[1024];
        while (fgets(line, sizeof line, f)) {
            bool nossa = line[0] == '\n' || line[0] == '\r';
            for (const char *p : nossas) nossa |= !strncmp(line, p, strlen(p));
            if (!nossa) alheias.push_back(ini_value(line, 0));
        }
        fclose(f);
    }
    const bool tem_api = std::any_of(alheias.begin(), alheias.end(), [](const std::string &l) { return !l.rfind("renderer=", 0); });
    if (FILE *f = fopen(ini_path().c_str(), "w")) {
        fprintf(f, "# Opções do PC (mudam pelo menu de pausa do jogo: Options)\n");
        fprintf(f, "hd_textures=%u\nps2_audio=%u\nresolution=%u\nfps=%s\nvsync=%u\nfps_counter=%u\nborderless=%u\nauto_qte=%u\n",
                g_opt.tex ? 1u : 0u, g_opt.audio ? 1u : 0u, g_opt.scale, g_opt.fps == 3 ? "max" : g_opt.fps == 2 ? "60" : "30",
                g_opt.vsync ? 1u : 0u, g_opt.counter ? 1u : 0u, g_opt.borderless ? 1u : 0u,
                g_opt.auto_qte ? 1u : 0u);
        fprintf(f, "cheat_infinite_health=%u\ncheat_infinite_magic=%u\ncheat_infinite_rage=%u\n", g_opt.inf_health ? 1u : 0u,
                g_opt.inf_magic ? 1u : 0u, g_opt.inf_rage ? 1u : 0u);
        fprintf(f, "enemy_health_bars=%u\n", g_opt.hp_bars ? 1u : 0u);
        fprintf(f, "aspect=%s\n", kAspectoNome[g_opt.aspecto >= 1 && g_opt.aspecto <= 6 ? g_opt.aspecto : 1]);
        if (!tem_api) fprintf(f, "renderer=%s\n", g_renderer.c_str());
        for (const std::string &l : alheias) fprintf(f, "%s\n", l.c_str());
        for (auto &[id, on] : g_mods) fprintf(f, "mod_%s=%u\n", id.c_str(), on ? 1u : 0u); // carregador de mods
        if (!iso.empty()) fprintf(f, "ps2_iso=%s\n", iso.c_str());
        fclose(f);
    }
}

void load() {
    if (FILE *f = fopen(ini_path().c_str(), "r")) {
        char line[1024];
        while (fgets(line, sizeof line, f)) {
            unsigned v = 0;
            if (sscanf(line, "hd_textures=%u", &v) == 1) g_opt.tex = v != 0;
            if (sscanf(line, "ps2_audio=%u", &v) == 1) g_opt.audio = v != 0;
            if (sscanf(line, "resolution=%u", &v) == 1) g_opt.scale = v <= 4 ? v : 0;
            if (sscanf(line, "fps=%u", &v) == 1) g_opt.fps = v == 60 ? 2 : v > 60 ? 3 : 1;
            if (!strncmp(line, "fps=max", 7)) g_opt.fps = 3;
            if (sscanf(line, "fps_counter=%u", &v) == 1) g_opt.counter = v != 0;
            if (sscanf(line, "vsync=%u", &v) == 1) g_opt.vsync = v != 0;
            if (sscanf(line, "borderless=%u", &v) == 1) g_opt.borderless = v != 0;
            if (sscanf(line, "auto_qte=%u", &v) == 1) g_opt.auto_qte = v != 0;
            if (sscanf(line, "cheat_infinite_health=%u", &v) == 1) g_opt.inf_health = v != 0;
            if (sscanf(line, "cheat_infinite_magic=%u", &v) == 1) g_opt.inf_magic = v != 0;
            if (sscanf(line, "cheat_infinite_rage=%u", &v) == 1) g_opt.inf_rage = v != 0;
            if (sscanf(line, "enemy_health_bars=%u", &v) == 1) g_opt.hp_bars = v != 0;
            if (!strncmp(line, "aspect=", 7))
                for (uint32_t i = 1; i <= 6; i++)
                    if (ini_value(line, 7) == kAspectoNome[i]) g_opt.aspecto = i;
            char mid[128];
            if (sscanf(line, "mod_%127[A-Za-z0-9_]=%u", mid, &v) == 2) set_mod(mid, v != 0);
            if (!strncmp(line, "ps2_iso=", 8)) g_iso = ini_value(line, 8);
            if (!strncmp(line, "renderer=", 9)) g_renderer = ini_value(line, 9);
        }
        fclose(f);
    }
    save(); // grava o caminho da ISO quando ele veio do iniciador
}

uint32_t cur_scale() {
    const uint32_t s = g_opt.scale ? g_opt.scale : gvk::auto_render_scale();
    return s < 1 ? 1 : s > 4 ? 4 : s;
}

uint32_t encode() {
    // áudio do PS2 só existe para o GoW1 (no GoW2 o menu mostra "Unavailable"); o pack de texturas, para os dois
    const bool g1 = opt_profile() == &kOptGow1;
    const uint32_t tex = texpack_available() ? (g_opt.tex ? 2u : 1u) : 3u; // pack do jogo em execução (texpack/<jogo>)
    const uint32_t aud = ps2audio_available() ? (g_opt.audio ? 2u : 1u) : 3u;
    uint32_t fps = g_opt.counter ? gvk::measured_fps() : 0;
    // A palavra passa por float no menu: exata só até 2^24, e com 7 bits o contador parava em 127. O contador do HUD só
    // lê a parte inteira de palavra / 2^17 (o erro do float fica nos bits de baixo), então jogando vai o FPS inteiro;
    // em menu/pausa, onde a página Options decodifica os bits de baixo, fica até 127 para continuar exata.
    const bool jogando = rd32(game_id() == 1 ? 0x812c2e04u : 0x812ec498u) == (game_id() == 1 ? 0xbu : 0xcu);
    fps = std::min<uint32_t>(fps, jogando ? 9999u : 127u);
    return tex | aud << 2 | cur_scale() << 4 | g_opt.fps << 7 | (g_opt.vsync ? 1u : 0u) << 9 |
           (g_opt.auto_qte ? 1u : 0u) << 10 | (g_opt.counter ? 1u : 0u) << 11 | (g_opt.borderless ? 1u : 0u) << 12 |
           (g_opt.inf_health ? 1u : 0u) << 13 | (g_opt.inf_magic ? 1u : 0u) << 14 | (g_opt.inf_rage ? 1u : 0u) << 15 | (g_opt.hp_bars ? 1u : 0u) << 16 | fps << 17;
}

bool is_gow1();
bool is_gow2();
const OptProfile *opt_profile() { return is_gow1() ? &kOptGow1 : is_gow2() ? &kOptGow2 : nullptr; }
bool is_gow2() {
    static int ok = -1;
    if (ok < 0) {
        constexpr uint32_t kNameWide2 = 0x81214970; // "WideScreen" no gow2 (0x214a70 no ELF)
        MEMORY_BASIC_INFORMATION mi{};
        if (!VirtualQuery(mem_base() + kNameWide2, &mi, sizeof mi) || mi.State != MEM_COMMIT) return (ok = 0) == 1;
        char name[11] = {};
        std::memcpy(name, ptr<char>(kNameWide2), 10);
        ok = !std::strcmp(name, "WideScreen") && !is_gow1();
    }
    return ok == 1;
}
bool is_gow1() {
    static int ok = -1;
    if (ok < 0) {
        MEMORY_BASIC_INFORMATION mi{};
        if (!VirtualQuery(mem_base() + kNameWide, &mi, sizeof mi) || mi.State != MEM_COMMIT) return (ok = 0) == 1;
        char name[11] = {};
        std::memcpy(name, ptr<char>(kNameWide), 10);
        ok = !std::strcmp(name, "WideScreen");
    }
    return ok == 1;
}

void on_import(arc_ctx *ctx, uint32_t stub) {
    const OptProfile *op = opt_profile();
    if (!op || stub != op->strncmp_stub || ctx->r[1] != op->fs_prefix || !ctx->r[0]) return;
    const char *c = gstr(ctx->r[0]);
    if (std::strncmp(c, "FSCommand:VT_", 13) != 0) return;
    char key[8] = {};
    unsigned v = 0;
    if (std::sscanf(c + 13, "%7[a-z]_%u", key, &v) != 2 || !v) return; // até 7 letras ("vsync")
    if (!std::strcmp(key, "tex")) g_req_tex = v;
    if (!std::strcmp(key, "aud")) g_req_aud = v;
    if (!std::strcmp(key, "res")) g_req_res = v;
    if (!std::strcmp(key, "fps")) g_req_fps = v;
    if (!std::strcmp(key, "cnt")) g_req_cnt = v;
    if (!std::strcmp(key, "dsp")) g_req_dsp = v;
    if (!std::strcmp(key, "vsync")) g_req_vsync = v;
    if (!std::strcmp(key, "qte")) g_req_qte = v;
    if (!std::strcmp(key, "ehp")) g_req_ehp = v;
    if (!std::strcmp(key, "hp")) g_req_hp = v;
    if (!std::strcmp(key, "mp")) g_req_mp = v;
    if (!std::strcmp(key, "rage")) g_req_rage = v;
    if (!std::strcmp(key, "trophy")) g_req_trophy = v;
    if (!std::strcmp(key, "restart")) g_req_restart = v;
    if (!std::strcmp(key, "asp") && v <= 6) g_req_asp = v;
    // aspq: consulta síncrona da linha Aspect Ratio (a palavra não tem mais bits livres): 1 = o índice no campo do
    // estado, 2 = o estado de sempre de volta
    if (!std::strcmp(key, "aspq")) {
        const uint32_t obj = rd32(op->optr);
        if (obj && rd32(obj) == op->vtbl) wr32(obj + op->field, v == 1 ? g_opt.aspecto : encode());
    }
    // moda..modp: liga/desliga o mod de índice 0..15 do menu
    if (!std::strncmp(key, "mod", 3) && key[3] >= 'a' && key[3] <= 'p' && !key[4]) g_req_mod[key[3] - 'a'] = v;
    // modq: consulta síncrona do menu (a página Mods): 1 = os bits dos mods (ligados) no campo do estado, que o
    // script do menu lê logo em seguida; 2 = o estado de sempre de volta
    if (!std::strcmp(key, "modq")) {
        uint32_t word = encode();
        if (v == 1) {
            word = 0;
            const auto ids = menu_mods(game_id());
            for (size_t i = 0; i < ids.size(); i++)
                if (!ids[i].empty() && mod_on(ids[i])) word |= 1u << i;
        }
        const uint32_t obj = rd32(op->optr);
        if (obj && rd32(obj) == op->vtbl) wr32(obj + op->field, word);
    }
}

// Cheats (menu de pausa: Infinite Health / Magic / Rage), aplicados a cada quadro dentro do jogo.
//   GoW2: as opções do modo de desafio (FreeCombat_InfiniteHealth/Magic/GodMode, +0x2a4.. do objeto de opções) são
//     copiadas para as globais 0x812eb058/5c/60 quando um desafio começa (sub_8106d2c0) e zeradas na saída
//     (0x8106f744); a função de dano (sub_81037338) não tira vida do Kratos com a primeira ligada, e as de magia e
//     fúria (0x8104fa12.., 0x81051882..) não gastam o medidor. Fora dos desafios ninguém as liga: o cheat as mantém.
//   GoW1: não tem essas globais; a tabela de ajustes do jogador (0x812c27f4, carregada de "/Player" em sub_8103fb6e)
//     tem 6 fantasias de 0x20 bytes em +0x204 (+4 "AI Damage Mult" = dano dos inimigos, +8 "Infinite Magic") e 6
//     níveis de arma de 0x48 bytes em +0x54 (+0x3c "God Mode Meter Drain" = quanto a fúria esvazia por segundo).
//     Cheat ligado: dano dos inimigos 0, magia infinita 1, dreno 0; desligado: os valores originais de volta.
void cheats_tick(int game) {
    static bool was[3] = {};
    const bool on[3] = {g_opt.inf_health, g_opt.inf_magic, g_opt.inf_rage};
    if (game == 2) {
        for (int i = 0; i < 3; i++) {
            const uint32_t a = 0x812eb058u + 4 * i;
            if (on[i]) wr32(a, 1);
            else if (was[i]) wr32(a, 0); // só desliga o que o cheat ligou
            was[i] = on[i];
        }
        return;
    }
    if (game != 1) return;
    constexpr uint32_t kPlayer = 0x812c27f4u;
    static uint32_t orig_dmg[6], orig_mag[6], orig_drain[6];
    for (int k = 0; k < 6; k++) {
        const uint32_t cos = kPlayer + 0x204 + 0x20 * k, lvl = kPlayer + 0x54 + 0x48 * k;
        const uint32_t vals[3] = {cos + 4, cos + 8, lvl + 0x3c};
        uint32_t *orig[3] = {orig_dmg, orig_mag, orig_drain};
        const uint32_t cheat[3] = {0u, 1u, 0u};  // 0.0f, verdadeiro, 0.0f
        for (int i = 0; i < 3; i++) {
            if (on[i]) {
                if (!was[i]) orig[i][k] = rd32(vals[i]); // a tabela pode ser recarregada (fase nova): reescreve
                if (rd32(vals[i]) != cheat[i]) wr32(vals[i], cheat[i]);
            } else if (was[i]) {
                wr32(vals[i], orig[i][k]);
            }
        }
    }
    for (int i = 0; i < 3; i++) was[i] = on[i];
}
const bool g_watch = (watch_import(on_import), true);

// Recarga do herói (GoW2) depois de "Apply". Trocar o herói no meio da partida deixa o Kratos novo sem posição nem
// câmera (o jogo só faz isso ao carregar um checkpoint), então o "Apply" volta ao último checkpoint pelo caminho do
// próprio jogo: na fila de comandos de carregamento (0x812eabb4, 32 entradas de 32 bytes {u16 comando, u16 arg,
// u32 valor, char nome[...] em +8}; o despachante 0x8101f2c8 consome da cabeça 0x812eafb8, se acrescenta no fim
// 0x812eafbc; contagem em 0x812eafb4) entra o comando 19, o mesmo de "Restart from last checkpoint" (0x810219c2).
// O carregamento do checkpoint (0x8107c0e2) só troca o herói se o salvo for diferente do atual ([0x812eb030]+4), e a
// troca (0x810221e8) só se ele for diferente do último pedido (0x812cb9a4): com os dois em -1 ele descarrega o
// herói e carrega o R_Hero do checkpoint de novo, agora do mod. Só com a partida rodando e a fila parada.
// abre o jogo de novo com a mesma linha de comando: herói, HUD e menus só são lidos na abertura
void restart_process() {
    wchar_t exe[MAX_PATH] = {};
    GetModuleFileNameW(nullptr, exe, MAX_PATH);
    std::wstring cmd = GetCommandLineW();
    STARTUPINFOW si{};
    si.cb = sizeof si;
    PROCESS_INFORMATION pi{};
    logf("vitart: reiniciando para aplicar os mods");
    if (CreateProcessW(exe, cmd.data(), nullptr, nullptr, FALSE, 0, nullptr, nullptr, &si, &pi)) {
        CloseHandle(pi.hThread), CloseHandle(pi.hProcess);
        ExitProcess(0);
    }
    logf("vitart: não deu para reiniciar (CreateProcess %lu)", GetLastError());
}

bool qte_na_tela(); // lá embaixo, junto das tabelas do QTE automático

// Um QTE na tela (botão, girar, sacudir) ou um sumiu há menos de 2,5 s: o agarrão começa antes do ícone e a
// animação sincronizada termina depois dele. Ícone fixo não conta: no GoW2 os "Static" (baú, inimigo que dá
// para agarrar) ficam no HUD quase o tempo todo e prendiam o jogo em 60 FPS.
// Kratos subindo ou descendo (pulo, queda, escalada, pendurado na borda, parede das lâminas do submundo). O jogo
// original só roda com dt >= 1 quadro de 60 Hz; abaixo disso (FPS acima de 60) o agarrar na borda falhava (desafio
// de Hades: ele caía direto), o pulo dava saltos e a escalada ficava lenta. Nesses momentos o ritmo volta a 60 com o
// dt original, como nos QTEs; no chão o FPS máximo continua. Posição medida: GoW1 [[0x812a6fa4]+4] +0x78/+0x7c/+0x80,
// GoW2 [[0x812cbae4]+4] +0x80/+0x84/+0x88 (y para cima).
bool kratos_no_ar() {
    using clk = std::chrono::steady_clock;
    const bool g1 = game_id() == 1;
    if (!g1 && game_id() != 2) return false;
    const uint32_t kp = rd32(g1 ? 0x812a6fa4u : 0x812cbae4u);
    static uint32_t obj_ok = 0; // objeto já conferido (a criatura muda ao carregar a fase)
    static bool tem_y = false;
    static float y0 = 0.f;
    static clk::time_point t0{};
    auto legivel = [](uint32_t a, uint32_t n) {
        if (a < 0x81000000u || a > 0xC0000000u - n) return false;
        MEMORY_BASIC_INFORMATION mi{};
        if (!VirtualQuery(mem_base() + a, &mi, sizeof mi) || mi.State != MEM_COMMIT || (mi.Protect & (PAGE_NOACCESS | PAGE_GUARD)))
            return false;
        return (uint64_t)((uint8_t *)mi.BaseAddress - mem_base()) + mi.RegionSize >= (uint64_t)a + n;
    };
    if (!kp || !legivel(kp + 4, 4)) return tem_y = false;
    const uint32_t obj = rd32(kp + 4);
    // objeto 0 enquanto a fase carrega: obj_ok também começa em 0, então sem esta linha lia o endereço 0x7c
    if (!obj) return tem_y = false;
    if (obj != obj_ok) {
        if (!legivel(obj, 0x100)) return tem_y = false;
        obj_ok = obj, tem_y = false;
    }
    float y;
    std::memcpy(&y, mem_base() + obj + (g1 ? 0x7c : 0x84), 4);
    const auto t = clk::now();
    bool mexeu = false;
    if (tem_y && std::isfinite(y)) {
        const double dt = std::chrono::duration<double>(t - t0).count();
        // ~2 unidades/s (o Kratos tem ~45 de altura): pega a escalada lenta e ignora o chão parado
        if (dt > 0 && std::fabs(y - y0) / dt > 2.0) mexeu = true;
    }
    tem_y = std::isfinite(y), y0 = y, t0 = t;
    return mexeu;
}

bool prompt_sincronizado() {
    using clk = std::chrono::steady_clock;
    static clk::time_point ate{};
    static clk::time_point ate_ar{};
    if (kratos_no_ar()) ate_ar = clk::now() + std::chrono::milliseconds(1500);
    if (clk::now() < ate_ar) {
        static bool avisou = false;
        if (!avisou && getenv("VITART_QTELOG")) avisou = true, logf("vitart: ritmo de 60 FPS travado (Kratos no ar/escalando)");
        return true;
    }
    const bool agora = qte_na_tela();
    const auto t = clk::now();
    if (agora) ate = t + std::chrono::milliseconds(2500);
    static bool antes = false;
    const bool r = t < ate;
    if (r != antes && getenv("VITART_QTELOG")) logf("vitart: ritmo de 60 FPS %s (ícone de botão)", r ? "travado" : "solto");
    antes = r;
    return r;
}

} // namespace

bool enemy_bars_enabled() { return g_opt.hp_bars; }

std::string renderer_choice() {
    if (FILE *f = fopen(ini_path().c_str(), "r")) {
        char line[1024];
        while (fgets(line, sizeof line, f))
            if (!strncmp(line, "renderer=", 9)) g_renderer = ini_value(line, 9);
        fclose(f);
    }
    return g_renderer;
}

// Antes do primeiro quadro: aplica as escolhas salvas (texturas, áudio e resolução valem também no GoW2).
void game_options_init() {
    load();
    texpack_set_enabled(g_opt.tex);
    ps2audio_set_enabled(g_opt.audio);
    if (g_opt.scale) gvk::set_render_scale(g_opt.scale);
    gvk::set_fps_counter(g_opt.counter && !opt_profile()); // nos dois GoW o contador é o do HUD (FLP)
    gvk::set_borderless(g_opt.borderless);
}

// VITART_ASPECTO_SONDA=1 (diagnóstico do ultrawide): já jogando, acha todo float 16:9 (0x3fe38e39) na memória do
// jogo, troca um de cada vez por 21:9 durante 40 quadros e anota se a projeção dos shaders mudou (g_Projection no
// GoW1, g_ViewProjection no GoW2); volta o valor original depois.
void sonda_aspecto() {
    static const bool liga = getenv("VITART_ASPECTO_SONDA") != nullptr;
    if (!liga || !game_id()) return;
    const bool jogando = rd32(game_id() == 1 ? 0x812c2e04u : 0x812ec498u) == (game_id() == 1 ? 0xbu : 0xcu);
    static std::vector<uint32_t> cand;
    static int fase = -1, espera = 0;
    static uint32_t quadros_jogando = 0;
    static float base = 0;
    auto fx = [] {
        float p[16] = {};
        uint32_t age = 0;
        if (game_id() == 1) return last_projection(p) ? p[0] : 0.f;
        return last_view_projection(p, age) ? std::sqrt(p[0] * p[0] + p[4] * p[4] + p[8] * p[8]) : 0.f;
    };
    if (!jogando) return;
    if (fase == -1) {
        if (++quadros_jogando < 300) return; // 5 s de jogo, câmera assentada
        for (uint32_t a = 0x81000000u; a < 0xC0000000u;) {
            MEMORY_BASIC_INFORMATION mi{};
            if (!VirtualQuery(mem_base() + a, &mi, sizeof mi)) break;
            const uint32_t fim = (uint32_t)std::min<uint64_t>(0xC0000000ull, (uint64_t)((uint8_t *)mi.BaseAddress - mem_base()) + mi.RegionSize);
            if (mi.State == MEM_COMMIT && !(mi.Protect & (PAGE_NOACCESS | PAGE_GUARD)))
                for (uint32_t q = a; q + 4 <= fim; q += 4)
                    if (rd32(q) == 0x3fe38e39u && cand.size() < 400) cand.push_back(q);
            a = fim > a ? fim : a + 0x1000;
        }
        base = fx();
        logf("vitart: sonda do aspecto: %zu floats 16:9, projeção base %.4f", cand.size(), base);
        fase = 0, espera = 0;
        return;
    }
    if (fase >= (int)cand.size()) return;
    const uint32_t a = cand[fase];
    if (espera == 0) {
        const float v = 2.370370f;
        uint32_t w;
        std::memcpy(&w, &v, 4);
        if (rd32(a) == 0x3fe38e39u) wr32(a, w);
    }
    if (++espera == 40) {
        const float agora = fx();
        logf("vitart: sonda do aspecto: %08x -> projeção %.4f (base %.4f)%s", a, agora, base,
             std::fabs(agora - base) > 0.01f ? "  <== MUDOU" : "");
        wr32(a, 0x3fe38e39u);
    }
    if (espera >= 60) fase++, espera = 0;
}

void game_options_tick() {
    sonda_aspecto();
    static bool inited = false;
    if (!inited) {
        inited = true;
        game_options_init();
        kbm_icons_start(); // ícones de teclado no HUD (kbm_icons.cpp)
    }
    // VITART_MEMSNAP=<pasta>:<s1>,<s2>,... (diagnóstico, para achar a vida e a magia): nos segundos pedidos despeja
    // a memória do guest em <pasta>/t<s> e anota os medidores do HUD (HealthMeter_Value/MagicMeter_Value, +0x14/+0x18
    // do objeto do HUD) em <pasta>/hud.txt.
    if (static const char *snap = getenv("VITART_MEMSNAP"); snap && game_id()) {
        static const auto t0 = std::chrono::steady_clock::now();
        static std::vector<int> when = [] {
            std::vector<int> v;
            const char *c = strrchr(getenv("VITART_MEMSNAP"), ':');
            for (c = c ? c + 1 : ""; *c; c = strchr(c, ',') ? strchr(c, ',') + 1 : "") v.push_back(atoi(c));
            return v;
        }();
        const double s = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
        if (!when.empty() && s >= when.front()) {
            const std::string dir = std::string(snap, strrchr(snap, ':') ? strrchr(snap, ':') - snap : strlen(snap));
            const std::string sub = dir + "/t" + std::to_string(when.front());
            std::filesystem::create_directories(sub);
            const uint32_t hud = rd32(game_id() == 1 ? 0x812a681cu : 0x812cb1b8u);
            float hp = 0, mp = 0;
            if (hud) std::memcpy(&hp, ptr<uint8_t>(hud + 0x14), 4), std::memcpy(&mp, ptr<uint8_t>(hud + 0x18), 4);
            if (FILE *f = fopen((dir + "/hud.txt").c_str(), "a")) fprintf(f, "t%d hud=%08x hp=%g mp=%g\n", when.front(), hud, hp, mp), fclose(f);
            dump_regions(sub, 0x80000000u, 0xC0000000u);
            when.erase(when.begin());
        }
    }
    // F11 / Alt+Enter também mudam o modo de exibição: a escolha acompanha (vale em todos os módulos)
    static bool applied_borderless = g_opt.borderless;
    if (const uint32_t v = g_req_dsp.exchange(0); v == 1 || v == 2) {
        g_opt.borderless = applied_borderless = v == 2;
        gvk::set_borderless(g_opt.borderless);
        save();
    } else {
        // janela diferente da escolha por alguns quadros seguidos = mudou por tecla (o pedido já aplicado
        // leva um quadro para valer)
        static int settle = 0;
        if (gvk::is_borderless() == applied_borderless) settle = 0;
        else if (++settle > 3) g_opt.borderless = applied_borderless = gvk::is_borderless(), save(), settle = 0;
    }
    // Tempo e ritmo, por jogo: endereços da estrutura de tempo e das palavras do remendo do dt
    // (tools/patch_gow1_dt.py, tools/patch_gow2_dt.py) e da flag do menu principal.
    struct TimeProfile {
        uint32_t floor, dt, menu; // piso do dt (float, centésimos de quadro), dt do quadro, = 1 no menu principal
    };
    static const TimeProfile kGow1{0x812b75d0, 0x812b75e0, 0x812bc0c0};
    static const TimeProfile kGow2{0x812df6d0, 0x812df6e0, 0x812e40e0}; // menu: 1 só no menu principal (memória comparada)
    const TimeProfile *tp = is_gow1() ? &kGow1 : is_gow2() ? &kGow2 : nullptr;
    if (tp) {
        // VITART_MEMSNAP="q1,q2,...": grava a memória global do jogo (0x81000000..0x81800000, só o mapeado)
        // nos quadros pedidos, em memsnap_<quadro>.bin (diagnóstico; assim foi achada a flag do menu)
        if (const char *ms = getenv("VITART_MEMSNAP")) {
            static uint32_t q = 0;
            q++;
            for (const char *e = ms; e && *e;) {
                if ((uint32_t)std::atoi(e) == q) {
                    char path[64];
                    std::snprintf(path, sizeof path, "memsnap_%05u.bin", q);
                    if (FILE *f = fopen(path, "wb")) {
                        std::vector<uint8_t> buf(0x800000, 0);
                        for (uint32_t a = 0x81000000; a < 0x81800000;) {
                            MEMORY_BASIC_INFORMATION mi{};
                            if (!VirtualQuery(mem_base() + a, &mi, sizeof mi)) break;
                            const uint32_t end = (uint32_t)std::min<uint64_t>(0x81800000ull, (uint64_t)((uint8_t *)mi.BaseAddress - mem_base()) + mi.RegionSize);
                            if (mi.State == MEM_COMMIT && !(mi.Protect & (PAGE_NOACCESS | PAGE_GUARD)))
                                std::memcpy(&buf[a - 0x81000000], mem_base() + a, end - a);
                            a = end;
                        }
                        fwrite(buf.data(), 1, buf.size(), f);
                        fclose(f);
                    }
                }
                e = std::strchr(e, ',');
                if (e) e++;
            }
        }
        // VITART_TIMEDUMP=1 (depuração): a soma do dt do jogo contra o relógio, a cada 10 s
        if (getenv("VITART_TIMEDUMP")) {
            static double game_t = 0;
            static uint32_t nframes = 0;
            static auto t0 = std::chrono::steady_clock::now();
            float dtv;
            const uint32_t raw = rd32(tp->dt);
            std::memcpy(&dtv, &raw, 4);
            if (std::isfinite(dtv) && dtv > 0 && dtv < 1) game_t += dtv, nframes++;
            const double real = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
            if (real >= 10) {
                logf("vitart: tempo do jogo %.2f s em %.2f s reais (%u quadros, razão %.3f), menu %u", game_t, real, nframes,
                     game_t / real, tp->menu ? rd32(tp->menu) : 0u);
                game_t = 0, nframes = 0, t0 = std::chrono::steady_clock::now();
            }
        }
        // 30/60 FPS: o jogo espera 2 vblanks por quadro e calcula dt = max(60/taxa, clamp(tempo real em
        // quadros, 1, 4)) / 60. Com 1 vblank o dt real é 1/60: o dobro de quadros na mesma velocidade. Acima de
        // 60 o piso de 1 quadro fazia o jogo acelerar; a DLL remendada lê o piso em tp->floor.
        display_set_fps60(g_opt.fps >= 2);
        static uint32_t refresh = 0;
        if (!refresh) {
            DEVMODEW dm{};
            dm.dmSize = sizeof dm;
            refresh = EnumDisplaySettingsW(nullptr, ENUM_CURRENT_SETTINGS, &dm) ? dm.dmDisplayFrequency : 60;
            if (refresh <= 61) refresh = 60; // VSync ligado: no máximo a taxa do monitor
            if (refresh > 240) refresh = 240;
        }
        // VSync desligado: sem limite (o jogo roda o mais rápido que der) e piso do dt em 1/3000 s;
        // ligado: 30, 60 ou a taxa do monitor
        // VSync com FPS máximo: a apresentação em FIFO espera o vblank do monitor e dá o ritmo sozinha (um limite por
        // software na mesma taxa brigava com o do monitor); 30/60 continuam pelo relógio do vitart (60 não divide 74 Hz)
        const bool fifo = g_opt.vsync && g_opt.fps == 3 && !getenv("VITART_NOFIFO");
        uint32_t target = !g_opt.vsync || fifo ? UINT32_MAX : g_opt.fps == 3 ? refresh : 0;
        if (const char *e = getenv("VITART_FPS")) target = (uint32_t)std::atoi(e); // teste
        gvk::set_vsync(g_opt.vsync, fifo);
        // o menu principal anima por quadro, não pelo tempo: nele o ritmo é o do jogo mesmo sem VSync
        // (GoW1: 0x812bc0c0 = 1 só no menu principal, achado comparando a memória global nas fases)
        display_set_fixed_step_addr(tp->menu);
        // estado do jogo (o mesmo do QTE automático): GoW1 0x812c2e04 = 0xb jogando; GoW2 0x812ec498 = 0xc jogando.
        // Qualquer outro (pausa, Power Up, carregamento, cenas) anima por quadro: 60 FPS no máximo.
        // QTE e agarrões também: as animações sincronizadas (o Kratos preso a uma junta do inimigo, "Use Sync
        // Joint" nos golpes) contam com passos de pelo menos 1 quadro, e acima de 60 FPS o Kratos saía do lugar
        const bool sincronizado = prompt_sincronizado();
        display_set_in_menu(sincronizado || rd32(game_id() == 1 ? 0x812c2e04u : 0x812ec498u) != (game_id() == 1 ? 0xbu : 0xcu));
        display_set_fps_target(target);
        const float floor = sincronizado ? 0.f : fifo ? 25.f : target == UINT32_MAX ? 2.f : target > 60 ? 25.f : 0.f; // centésimos de quadro de 60 Hz
        uint32_t fb;
        std::memcpy(&fb, &floor, 4);
        if (rd32(tp->floor) != fb) wr32(tp->floor, fb);
    }
    const OptProfile *op = opt_profile();
    if (!op) return;
    // VITART_RES_AT="quadro:escala,..." (teste): troca a resolução ao vivo em quadros definidos, como o menu.
    {
        static uint32_t frame = 0;
        static const char *at = getenv("VITART_RES_AT");
        frame++;
        for (const char *e = at; e && *e;) {
            unsigned fr = 0, sc = 0;
            if (std::sscanf(e, "%u:%u", &fr, &sc) == 2 && fr == frame) g_req_res = sc;
            e = std::strchr(e, ',');
            if (e) e++;
        }
    }
    // VITART_TEST_NOTIFY (teste): mostra o aviso de troféu no quadro 400
    if (static const char *tn = getenv("VITART_TEST_NOTIFY"); tn) {
        static uint32_t n = 0;
        if (++n == 400)
            gvk::notify(std::string("Troféu desbloqueado (Bronze)") + char(10) + "Zero Health = Bronze Trophy" + char(10) +
                        "Open a Health Chest when your health meter is already full");
    }
    // pedidos do menu
    bool changed = false;
    if (const uint32_t v = g_req_tex.exchange(0); v && texpack_available() && (v == 2) != g_opt.tex)
        g_opt.tex = v == 2, texpack_set_enabled(g_opt.tex), changed = true;
    if (const uint32_t v = g_req_aud.exchange(0); v && ps2audio_available() && (v == 2) != g_opt.audio)
        g_opt.audio = v == 2, ps2audio_set_enabled(g_opt.audio), changed = true;
    if (const uint32_t v = g_req_res.exchange(0); v >= 1 && v <= 4 && v != cur_scale()) {
        g_opt.scale = v, changed = true;
        gvk::set_render_scale(v);
        logf("vitart: resolução interna %ux (%ux%u)", v, 960 * v, 544 * v);
    }
    if (const uint32_t v = g_req_asp.exchange(0); v >= 1 && v <= 6 && v != g_opt.aspecto) {
        g_opt.aspecto = v, changed = true;
        logf("vitart: proporção da tela %s", kAspectoNome[v]);
    }
    // ultrawide: o quanto a imagem fica mais larga que a do jogo (720x408). Auto = a do monitor; perto do 16:9 fica 1
    {
        float a = kAspecto[g_opt.aspecto <= 6 ? g_opt.aspecto : 1];
        if (a <= 0) a = (float)GetSystemMetrics(SM_CXSCREEN) / (float)std::max(1, GetSystemMetrics(SM_CYSCREEN));
        if (const char *e = getenv("VITART_ASPECT")) a = (float)std::atof(e); // teste
        float w = a / (720.f / 408.f);
        if (std::fabs(a - 16.f / 9.f) < 0.03f) w = 1.f;
        gvk::set_aspect_widen(w);
    }
    if (const uint32_t v = g_req_fps.exchange(0); v >= 1 && v <= 3 && v != g_opt.fps) {
        g_opt.fps = v, changed = true;
        logf("vitart: FPS %s", v == 3 ? "máximo" : v == 2 ? "60" : "30");
    }
    if (const uint32_t v = g_req_vsync.exchange(0); (v == 1 || v == 2) && (v == 2) != g_opt.vsync) {
        g_opt.vsync = v == 2, changed = true;
        logf("vitart: VSync %s", g_opt.vsync ? "ligado" : "desligado");
    }
    if (const uint32_t v = g_req_qte.exchange(0); (v == 1 || v == 2) && (v == 2) != g_opt.auto_qte) {
        g_opt.auto_qte = v == 2, changed = true;
        logf("vitart: QTE automático %s", g_opt.auto_qte ? "ligado" : "desligado");
    }
    if (const uint32_t v = g_req_ehp.exchange(0); (v == 1 || v == 2) && (v == 2) != g_opt.hp_bars) {
        g_opt.hp_bars = v == 2, changed = true;
        logf("vitart: barras de vida dos inimigos %s", g_opt.hp_bars ? "ligadas" : "desligadas");
    }
    if (const uint32_t v = g_req_cnt.exchange(0); (v == 1 || v == 2) && (v == 2) != g_opt.counter) {
        g_opt.counter = v == 2, changed = true;
    }
    for (auto [req, opt, what] : {std::tuple{&g_req_hp, &g_opt.inf_health, "vida infinita"},
                                  std::tuple{&g_req_mp, &g_opt.inf_magic, "magia infinita"},
                                  std::tuple{&g_req_rage, &g_opt.inf_rage, "fúria infinita"}})
        if (const uint32_t v = req->exchange(0); (v == 1 || v == 2) && (v == 2) != *opt) {
            *opt = v == 2, changed = true;
            logf("vitart: cheat %s %s", what, *opt ? "ligado" : "desligado");
        }
    if (g_req_trophy.exchange(0) == 2) trophy_unlock_all();
    // VITART_TEST_HOTMOD=<s>[,<s>...] (teste): nesses segundos inverte o mod 0 e aplica, como o menu Mods faria
    if (static const char *hm = getenv("VITART_TEST_HOTMOD"); hm && game_id()) {
        static const auto t0 = std::chrono::steady_clock::now();
        static const char *next = hm;
        if (*next && std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count() >= atof(next)) {
            next = strchr(next, ',') ? strchr(next, ',') + 1 : "";
            const auto ids = menu_mods(game_id());
            if (!ids.empty()) g_req_mod[0] = mod_on(ids[0]) ? 1 : 2, g_req_restart = 2;
        }
    }
    // VITART_TEST_TROPHIES=<s> (teste): nesse segundo faz o cheat "Unlock All Trophies"
    if (static const char *tt = getenv("VITART_TEST_TROPHIES"); tt && game_id()) {
        static const auto t0 = std::chrono::steady_clock::now();
        static bool done = false;
        if (!done && std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count() >= atof(tt))
            done = true, g_req_trophy = 2;
    }
    for (int i = 0; i < 16; i++)
        if (const uint32_t v = g_req_mod[i].exchange(0); v == 1 || v == 2) {
            const auto ids = menu_mods(game_id());
            if ((size_t)i < ids.size() && !ids[i].empty()) {
                set_mod(ids[i], v == 2), changed = true;
                logf("vitart: mod %s %s", ids[i].c_str(), v == 2 ? "ligado" : "desligado");
            }
        }
    if (g_req_restart.exchange(0) == 2) {
        save();
        // Apply: texturas e o resto trocam na hora; herói, HUD e menus pedem o jogo aberto de novo
        bool hero = false, boot = false;
        for (const std::string &n : mods_hot_apply()) {
            if (n.find("r_hero") != std::string::npos) hero = true;
            if (n.find("r_perma") != std::string::npos || n.find("r_shella") != std::string::npos) boot = true;
        }
        logf("vitart: mods aplicados%s", hero || boot ? "; herói/HUD/menus mudaram, reiniciando" : "");
        if (hero || boot) restart_process();
    }
    cheats_tick(game_id());
    enemy_hp_tick(game_id());
    if (changed) save();
    // estado para o menu mostrar
    const uint32_t obj = rd32(op->optr);
    if (getenv("VITART_OPTLOG")) {
        static uint32_t n = 0, prev = 0, overwritten = 0;
        if (obj && rd32(obj) == op->vtbl && prev && rd32(obj + op->field) != prev) overwritten++;
        if (n++ % 600 == 0)
            logf("vitart: opções: objeto 0x%08x vtable 0x%08x (esperada 0x%08x), campo 0x%08x, sobrescrito pelo jogo %u vezes",
                 obj, obj ? rd32(obj) : 0, op->vtbl, obj ? rd32(obj + op->field) : 0, overwritten);
        prev = encode();
    }
    if (!obj || rd32(obj) != op->vtbl) return;
    const uint32_t want = encode();
    if (rd32(obj + op->field) != want) wr32(obj + op->field, want);
}

// Jogo carregado: 1 = GoW1, 2 = GoW2, 0 = outro (o menu da coletânea).
int game_id() { return is_gow1() ? 1 : is_gow2() ? 2 : 0; }

// Dentro de um dos jogos e fora do menu principal (flags achadas comparando a memória global).
bool game_in_gameplay() {
    const int g = game_id();
    return g && rd32(g == 1 ? 0x812bc0c0u : 0x812e40e0u) != 1;
}

// QTE automático: o botão que o HUD está pedindo vira entrada, somada à do jogador.
//   GoW1: sub_8101406c(hud, índice) mostra o ícone e guarda o índice em hud+0x1570 (-1 = nenhum); hud é o
//     objeto em 0x812a681c (o mesmo das opções). Índices = tabela de nomes em 0x812a6858: 0 X, 1 triângulo,
//     2 círculo, 3 quadrado, 4..7 meia-volta do analógico (Up180CW, Up180CCW, Down180CW, Down180CCW), 8 360CW,
//     9 360CCW, 10 X repetido, 11 R2 repetido (portas), 12 sacudir o analógico, 13 vaivém, 14 R2 parado.
//     Estado do jogo em 0x812c2e04 (máquina de estados de sub_8105fc..810614xx): 0xb = jogo correndo, 0xc = pausa
//     (achado comparando a memória pausada e não pausada); fora do 0xb nada é apertado.
//   GoW2: sub_81070b60(slot, valor) grava o ícone em 0x812ec588 + 4*slot; o valor é o hash do nome do
//     clipe (h = h*127 + maiúscula, sub_811346de): "PB_XBtn", "PB_360CW", "PB_CircleBtnSmash"...
// Botões no SceCtrlData do modo PS TV (L2/R2 = 0x100/0x200, L1/R1 = 0x400/0x800).
namespace {
enum QteKind { QNone, QPress, QHold, QCw, QCcw, QWiggleX, QWiggleY };
struct Qte {
    QteKind kind;
    uint32_t buttons;
};
uint32_t gow_hash(const char *s) {
    uint32_t h = 0;
    for (; *s; s++) h = h * 127 + (uint32_t)(int8_t)(*s >= 'a' && *s <= 'z' ? *s - 32 : *s);
    return h;
}
Qte qte_gow1(uint32_t idx) {
    static const Qte t[15] = {{QPress, 0x4000}, {QPress, 0x1000}, {QPress, 0x2000}, {QPress, 0x8000}, {QCw, 0},
                              {QCcw, 0},        {QCw, 0},         {QCcw, 0},        {QCw, 0},         {QCcw, 0},
                              {QPress, 0x4000}, {QPress, 0x200},  {QWiggleX, 0},    {QWiggleY, 0},    {QNone, 0}};
    return idx < 15 ? t[idx] : Qte{QNone, 0};
}
Qte qte_gow2(uint32_t hash, bool &known) {
    struct Name {
        const char *name;
        Qte q;
    };
    static const Name names[] = {
        {"PB_XBtn", {QPress, 0x4000}},        {"PB_TriangleBtn", {QPress, 0x1000}}, {"PB_CircleBtn", {QPress, 0x2000}},
        {"PB_SquareBtn", {QPress, 0x8000}},   {"PB_Up180CW", {QCw, 0}},              {"PB_Up180CCW", {QCcw, 0}},
        {"PB_Down180CW", {QCw, 0}},           {"PB_Down180CCW", {QCcw, 0}},          {"PB_360CW", {QCw, 0}},
        {"PB_360CCW", {QCcw, 0}},             {"PB_Stick360CW", {QCw, 0}},           {"PB_Stick360CCW", {QCcw, 0}},
        {"PB_Stick360CWF", {QCw, 0}},         {"PB_Stick360CCWF", {QCcw, 0}},        {"PB_StickShake", {QWiggleX, 0}},
        {"PB_StickBack", {QWiggleY, 0}},      {"PB_CircleBtnSmash", {QPress, 0x2000}}, {"PB_CircleBtnHold", {QHold, 0x2000}},
        {"PB_R1BtnHold", {QHold, 0x800}},     {"PB_R1BtnStatic", {QNone, 0}},        {"PB_CircleBtnStatic", {QNone, 0}},
        {"PB_CSBtnFail", {QNone, 0}},
    };
    static std::vector<std::pair<uint32_t, Qte>> table;
    if (table.empty())
        for (const Name &n : names) table.push_back({gow_hash(n.name), n.q});
    known = false;
    for (auto &[h, q] : table)
        if (h == hash) return known = true, q;
    return {QNone, 0};
}

bool qte_na_tela() {
    if (game_id() == 1) {
        const uint32_t hud = rd32(0x812a681c);
        return hud && rd32(hud) == kOptGow1.vtbl && qte_gow1(rd32(hud + 0x1570)).kind != QNone;
    }
    if (game_id() != 2) return false;
    for (uint32_t s = 0; s < 8; s++) {
        bool known;
        if (const uint32_t v = rd32(0x812ec588 + 4 * s); v && qte_gow2(v, known).kind != QNone) return true;
    }
    return false;
}
} // namespace

uint32_t game_qte_auto(uint8_t &lx, uint8_t &ly) {
    const int g = game_id();
    if (!g || (!g_opt.auto_qte && !getenv("VITART_AUTO_QTE"))) return 0;
    Qte q{QNone, 0};
    static const bool log = getenv("VITART_QTELOG") != nullptr;
    static uint32_t last_seen = 0xffffffffu;
    uint32_t seen = 0xffffffffu;
    if (g == 1) {
        const uint32_t hud = rd32(0x812a681c);
        if (!hud || rd32(hud) != kOptGow1.vtbl) return 0;
        const uint32_t idx = rd32(hud + 0x1570);
        const bool menu = rd32(0x812c2e04) != 0xb; // estado do jogo: 0xb = correndo (0xc pausa, outros = menus e cenas)
        seen = menu ? 0xfffffffeu : idx;
        if (!menu) q = qte_gow1(idx);
    } else {
        if (rd32(0x812ec498) != 0xc) return 0; // estado do jogo no GoW2: 0xc = correndo, 0xd = pausa (memória comparada)
        for (uint32_t s = 0; s < 8 && q.kind == QNone; s++) {
            const uint32_t v = rd32(0x812ec588 + 4 * s);
            if (!v) continue;
            bool known;
            q = qte_gow2(v, known);
            if (q.kind != QNone || !known) seen = v;
            if (log && !known) {
                static uint32_t unknown_logged = 0;
                if (v != unknown_logged) unknown_logged = v, logf("vitart: QTE: ícone desconhecido no slot %u: hash 0x%08x", s, v);
            }
        }
    }
    if (log && seen != last_seen) logf("vitart: QTE: %s 0x%08x -> tipo %d botões 0x%x", g == 1 ? "índice" : "hash", seen, (int)q.kind, q.buttons);
    last_seen = seen;
    if (q.kind == QNone) return 0;
    const double t = std::chrono::duration<double>(std::chrono::steady_clock::now().time_since_epoch()).count();
    switch (q.kind) {
    case QPress: return std::fmod(t, 0.07) < 0.035 ? q.buttons : 0; // ~14 toques por segundo (serve para os repetidos)
    case QHold: return q.buttons;
    case QCw:
    case QCcw: { // 2,5 voltas por segundo; horário na tela = cima, direita, baixo, esquerda
        const double a = t * 2.5 * 6.283185307 * (q.kind == QCw ? 1 : -1);
        lx = (uint8_t)std::lround(128 + 127 * std::sin(a));
        ly = (uint8_t)std::lround(128 - 127 * std::cos(a));
        return 0;
    }
    case QWiggleX: lx = std::fmod(t, 0.12) < 0.06 ? 0 : 255; return 0;
    case QWiggleY: ly = std::fmod(t, 0.12) < 0.06 ? 0 : 255; return 0;
    default: return 0;
    }
}

} // namespace vt
