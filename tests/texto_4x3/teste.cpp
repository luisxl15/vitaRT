// Teste do texto 4:3 (runtime/vitart/gxm_texto.cpp) sem o jogo: desenhos montados como os do menu de pausa das
// fotos (1920x1080), e a conferência de cada linha depois de estreitada.
//   clang++ -std=c++20 -I runtime/vitart tests/texto_4x3/teste.cpp runtime/vitart/gxm_texto.cpp -o teste.exe
#include "gxm_texto.h"

#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

namespace {
const float W = 1920, H = 1080, S = (4.f / 3.f) / (W / H);
int falhas = 0;

void confere(bool ok, const char *o_que, const std::string &linha) {
    if (!ok) falhas++;
    std::printf("  %s %-14s %s\n", ok ? "ok  " : "FALHA", o_que, linha.c_str());
}

struct Linha {
    std::string nome;
    float x0, y, h;   // pixels: canto esquerdo, topo, altura das letras
    int letras;       // letras e espaços: cada letra 0,8h de largura (já esticada 1,33x), espaço 0,45h
    const char *ancora; // o que tem de ficar parado: "esq", "centro", "dir"
    std::vector<std::pair<float, float>> glifos; // x0, x1 em pixels
};

// Glifos de uma linha: "#" letra, " " espaço.
void monta(Linha &l, const std::string &padrao) {
    float x = l.x0;
    for (char c : padrao) {
        if (c == ' ') { x += 0.45f * l.h; continue; }
        const float w = 0.8f * l.h;
        l.glifos.push_back({x, x + w});
        x += w + 0.08f * l.h;
    }
}

float cx(float px) { return px / W * 2.f - 1.f; }
float cy(float py) { return 1.f - py / H * 2.f; }

// Um desenho com as linhas dadas; faixa = triângulos em faixa ligados por degenerados (senão lista).
// cru: posição num stream float (passo de 20 bytes, como x,y,z + uv); senão o caminho de conversão na CPU.
void roda(const char *nome, std::vector<Linha> linhas, bool faixa, bool cru, float sombra = 0) {
    std::printf("%s\n", nome);
    std::vector<float> pos; // x, y por vértice (pixels)
    std::vector<uint16_t> idx;
    for (int vez = 0; vez < (sombra ? 2 : 1); vez++)
        for (auto &l : linhas)
            for (auto [a, b] : l.glifos) {
                const float d = vez ? sombra : 0;
                const uint16_t v = (uint16_t)(pos.size() / 2);
                for (auto [px, py] : {std::pair{a, l.y}, {b, l.y}, {a, l.y + l.h}, {b, l.y + l.h}}) pos.push_back(px + d), pos.push_back(py + d);
                if (faixa) {
                    if (!idx.empty()) idx.push_back(idx.back()), idx.push_back(v); // degenerados entre glifos
                    for (int k = 0; k < 4; k++) idx.push_back((uint16_t)(v + k));
                } else {
                    for (int k : {0, 1, 2, 2, 1, 3}) idx.push_back((uint16_t)(v + k));
                }
            }
    const uint32_t nv = (uint32_t)pos.size() / 2;
    gvk::Draw d;
    d.target_w = (uint32_t)W, d.target_h = (uint32_t)H;
    d.vertex_count = nv;
    d.index_data = idx.data(), d.index_size = 2, d.index_count = (uint32_t)idx.size();
    d.topology = faixa ? 1 : 0;
    std::vector<float> attrs(2 * nv * 4, 0.f); // location 0 = uv (lixo), 1 = posição
    std::vector<uint8_t> stream(20 * nv, 0);
    for (uint32_t v = 0; v < nv; v++) {
        const float x = cx(pos[2 * v]), y = cy(pos[2 * v + 1]);
        attrs[(nv + v) * 4] = x, attrs[(nv + v) * 4 + 1] = y, attrs[(nv + v) * 4 + 3] = 1;
        std::memcpy(&stream[20 * v + 8], &x, 4), std::memcpy(&stream[20 * v + 12], &y, 4);
    }
    if (cru) {
        d.raw_streams.push_back({stream.data(), 20, 20 * nv});
        d.raw_attrs.push_back({0, 0, 0, 9, 2});
        d.raw_attrs.push_back({1, 0, 8, 9, 2});
    } else {
        d.attr_count = 2, d.attrs = attrs.data();
    }
    const std::vector<uint8_t> antes = stream;
    std::vector<uint8_t> copia;
    if (!squeeze_text_lines(d, 1, S, copia)) {
        confere(false, "não mexeu", "");
        return;
    }
    if (cru) confere(stream == antes, "memória intacta", "(o jogo não vê a mudança)");
    auto x_de = [&](uint32_t v) {
        float x;
        if (cru) std::memcpy(&x, d.raw_streams[0].data + 20 * v + 8, 4);
        else x = d.attrs[(nv + v) * 4];
        return (x + 1.f) * 0.5f * W;
    };
    uint32_t v = 0;
    for (int vez = 0; vez < (sombra ? 2 : 1); vez++)
        for (auto &l : linhas) {
            const float d0 = vez ? sombra : 0;
            const float a0 = l.glifos.front().first + d0, a1 = l.glifos.back().second + d0;
            const float n0 = x_de(v), n1 = x_de(v + 4 * (uint32_t)(l.glifos.size() - 1) + 1);
            const float w0 = l.glifos.front().second - l.glifos.front().first, nw = x_de(v + 1) - x_de(v);
            char txt[160];
            std::snprintf(txt, sizeof txt, "%s%s: %.0f..%.0f -> %.0f..%.0f", vez ? "(sombra) " : "", l.nome.c_str(), a0, a1, n0, n1);
            confere(std::fabs(nw - w0 * S) < 0.5f, "largura 4:3", txt);
            bool parado;
            if (!std::strcmp(l.ancora, "esq")) parado = std::fabs(n0 - a0) < 0.5f;
            else if (!std::strcmp(l.ancora, "dir")) parado = std::fabs(n1 - a1) < 0.5f;
            else parado = std::fabs((n0 + n1) - (a0 + a1)) < 1.f;
            confere(parado, l.ancora, txt);
            v += 4 * (uint32_t)l.glifos.size();
        }
}
} // namespace

int main() {
    std::vector<Linha> pausa = {
        {"CONTINUE", 0, 295, 60, 0, "centro"},
        {"OPTIONS", 0, 435, 50, 0, "centro"},
        {"RESTART FROM LAST CHECKPOINT", 0, 570, 50, 0, "centro"},
        {"QUIT GAME", 0, 705, 50, 0, "centro"},
    };
    for (auto &l : pausa) {
        std::string p;
        for (char c : l.nome) p += c == ' ' ? ' ' : '#';
        float w = 0;
        for (char c : p) w += c == ' ' ? 0.45f * l.h : 0.88f * l.h;
        l.x0 = 960 - (w - 0.08f * l.h) / 2;
        monta(l, p);
    }
    roda("menu de pausa (lista)", pausa, false, false);
    roda("menu de pausa (faixa, stream cru)", pausa, true, true);
    roda("menu de pausa com sombra de 3 px", pausa, false, true, 3);

    std::vector<Linha> opcoes = {
        {"MUSIC VOLUME", 120, 205, 60, 0, "esq"},
        {"SFX VOLUME", 262, 315, 50, 0, "esq"},
        {"AUDIO & GAMEPLAY", 262, 525, 50, 0, "esq"},
        {"RETURN TO PAUSE MENU", 262, 840, 50, 0, "esq"},
        {"ORBES 12345", 0, 40, 40, 0, "dir"},
    };
    for (auto &l : opcoes) {
        std::string p;
        for (char c : l.nome) p += c == ' ' ? ' ' : '#';
        if (l.nome == "ORBES 12345") {
            float w = 0;
            for (char c : p) w += c == ' ' ? 0.45f * l.h : 0.88f * l.h;
            l.x0 = 1880 - (w - 0.08f * l.h);
        }
        monta(l, p);
    }
    roda("opções e contador à direita", opcoes, false, true);

    // rodapé: [ícone] = SELECT e [ícone] = BACK na mesma altura, separados por um vão largo
    std::vector<Linha> rodape = {
        {"[SPACE] = SELECT", 590, 965, 45, 0, "esq"},
        {"[MOUSE] = BACK", 1028, 965, 45, 0, "esq"},
    };
    monta(rodape[0], "# # ######");
    monta(rodape[1], "# # ####");
    std::printf("rodapé: grupos de %.0f..%.0f e %.0f..%.0f\n", rodape[0].glifos.front().first, rodape[0].glifos.back().second,
                rodape[1].glifos.front().first, rodape[1].glifos.back().second);
    roda("rodapé com dois grupos", rodape, false, true);

    std::printf(falhas ? "\n%d FALHAS\n" : "\ntudo certo\n", falhas);
    return falhas != 0;
}
