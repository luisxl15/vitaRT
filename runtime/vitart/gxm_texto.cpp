// Texto da interface na proporção 4:3 (o porquê está em squeeze_text, hle_gxm.cpp): a geometria, separada para
// o teste em tests/texto_4x3 rodar sem o jogo.
#include "gxm_texto.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <unordered_map>

// Glifos (triângulos ligados) -> linhas (glifos lado a lado na mesma altura) -> cada linha encolhe s vezes na
// largura em volta da âncora. pos: location do atributo de posição (coordenada de tela, x e y em -1..1).
// A posição crua vai para a cópia (copy), não para a memória do jogo: o FLP reaproveita os vértices.
bool squeeze_text_lines(gvk::Draw &d, int pos, float s, std::vector<uint8_t> &copy) {
    const uint32_t nv = d.vertex_count;
    float *cpu = nullptr; // caminho de conversão na CPU: [atributo][vértice][4]
    uint8_t *raw = nullptr;
    uint32_t stride = 0;
    if (d.raw_attrs.empty()) {
        if ((uint32_t)pos >= d.attr_count) return false;
        cpu = const_cast<float *>(d.attrs) + (size_t)pos * nv * 4;
    } else {
        const gvk::VertexAttr *a = nullptr;
        for (const auto &x : d.raw_attrs)
            if (x.location == (uint32_t)pos) a = &x;
        if (!a || a->fmt != 9 || a->comps < 2) return false; // posição em float, o formato da interface
        gvk::VertexStream &st = d.raw_streams[a->stream];
        copy.assign(st.data, st.data + st.size);
        st.data = copy.data();
        raw = copy.data() + a->offset, stride = st.stride;
    }
    auto xy = [&](uint32_t v, int c) -> float & {
        return cpu ? cpu[4 * v + c] : *reinterpret_cast<float *>(raw + (size_t)v * stride + 4 * c);
    };
    const float hw = d.target_w * 0.5f, hh = d.target_h * 0.5f; // coordenada de tela -> pixels
    // glifos: componentes ligadas dos triângulos (os degenerados das faixas não ligam nada)
    std::vector<uint32_t> up(nv);
    for (uint32_t v = 0; v < nv; v++) up[v] = v;
    auto root = [&](uint32_t v) {
        while (up[v] != v) v = up[v] = up[up[v]];
        return v;
    };
    auto index = [&](uint32_t i) -> int64_t {
        const int64_t r = d.index_size == 4 ? (int64_t)static_cast<const uint32_t *>(d.index_data)[i]
                                            : (int64_t)static_cast<const uint16_t *>(d.index_data)[i];
        return r + d.vertex_offset;
    };
    const uint32_t n = d.index_count;
    const uint32_t ntri = d.topology == 0 ? n / 3 : n >= 3 ? n - 2 : 0;
    for (uint32_t t = 0; t < ntri; t++) {
        int64_t i0, i1, i2;
        if (d.topology == 0) i0 = index(3 * t), i1 = index(3 * t + 1), i2 = index(3 * t + 2);
        else if (d.topology == 1) i0 = index(t), i1 = index(t + 1), i2 = index(t + 2);
        else i0 = index(0), i1 = index(t + 1), i2 = index(t + 2);
        if (i0 < 0 || i1 < 0 || i2 < 0 || i0 >= nv || i1 >= nv || i2 >= nv) continue;
        const float ax = xy((uint32_t)i1, 0) - xy((uint32_t)i0, 0), ay = xy((uint32_t)i1, 1) - xy((uint32_t)i0, 1);
        const float bx = xy((uint32_t)i2, 0) - xy((uint32_t)i0, 0), by = xy((uint32_t)i2, 1) - xy((uint32_t)i0, 1);
        if (std::fabs(ax * by - ay * bx) * hw * hh < 1e-3f) continue;
        up[root((uint32_t)i1)] = root((uint32_t)i0);
        up[root((uint32_t)i2)] = root((uint32_t)i0);
    }
    struct Box {
        float x0 = 1e9f, x1 = -1e9f, y0 = 1e9f, y1 = -1e9f;
        int line = -1;
    };
    std::unordered_map<uint32_t, Box> glyph;
    std::vector<int64_t> used(nv, -1); // vértice -> raiz do glifo (só os que algum triângulo usa)
    for (uint32_t t = 0; t < ntri; t++)
        for (int c = 0; c < 3; c++) {
            const int64_t v = d.topology == 0 ? index(3 * t + c) : d.topology == 1 ? index(t + c) : c ? index(t + c) : index(0);
            if (v < 0 || v >= nv || used[v] >= 0) continue;
            used[v] = root((uint32_t)v);
        }
    for (uint32_t v = 0; v < nv; v++) {
        if (used[v] < 0) continue;
        Box &b = glyph[(uint32_t)used[v]];
        const float px = xy(v, 0) * hw, py = xy(v, 1) * hh;
        b.x0 = std::min(b.x0, px), b.x1 = std::max(b.x1, px), b.y0 = std::min(b.y0, py), b.y1 = std::max(b.y1, py);
    }
    if (glyph.empty()) return false;
    // linhas: da esquerda para a direita, cada glifo entra na linha da mesma altura que acabou perto dele
    std::vector<Box *> order;
    for (auto &[r, b] : glyph) order.push_back(&b);
    std::sort(order.begin(), order.end(), [](const Box *a, const Box *b) { return a->x0 < b->x0; });
    struct Line {
        float x0, x1, y0, y1;
        float anchor = 0;
    };
    std::vector<Line> lines;
    for (Box *b : order) {
        const float h = b->y1 - b->y0;
        int best = -1;
        for (int li = (int)lines.size() - 1; li >= 0 && best < 0; li--) {
            Line &l = lines[li];
            const float lh = l.y1 - l.y0;
            const float overlap = std::min(b->y1, l.y1) - std::max(b->y0, l.y0);
            if (overlap >= 0.5f * std::min(h, lh) && b->x0 - l.x1 <= 1.5f * std::max(h, lh)) best = li;
        }
        if (best < 0) best = (int)lines.size(), lines.push_back({b->x0, b->x1, b->y0, b->y1});
        Line &l = lines[best];
        l.x0 = std::min(l.x0, b->x0), l.x1 = std::max(l.x1, b->x1), l.y0 = std::min(l.y0, b->y0), l.y1 = std::max(l.y1, b->y1);
        b->line = best;
    }
    for (Line &l : lines) {
        const float c = 0.5f * (l.x0 + l.x1); // pixels a partir do centro da tela
        // centralizada: o centro; encostada no quarto direito (contadores): a borda direita; o resto, a esquerda,
        // que é onde fica o ícone de botão quando há um ("[X] = Select": o ícone de malha não se mexe)
        l.anchor = std::fabs(c) < 0.06f * d.target_w ? c : c > 0 && l.x1 > 0.25f * d.target_w ? l.x1 : l.x0;
    }
    for (uint32_t v = 0; v < nv; v++) {
        if (used[v] < 0) continue;
        const float a = lines[glyph[(uint32_t)used[v]].line].anchor / hw;
        float &x = xy(v, 0);
        x = a + (x - a) * s;
    }
    return true;
}

// ---------------------------------------------------------------- grupos do HUD entre desenhos (gxm_texto.h)
static bool encostadas(const HudGrupos::B &a, const HudGrupos::B &b, float folga) {
    return a.x0 <= b.x1 + folga && b.x0 <= a.x1 + folga && a.y0 <= b.y1 && b.y0 <= a.y1;
}
void HudGrupos::quadro(uint32_t f) {
    if (f == q) return;
    q = f;
    prev.swap(atual);
    atual.clear();
    const uint32_t n = (uint32_t)prev.size();
    std::vector<uint32_t> g(n);
    for (uint32_t i = 0; i < n; i++) g[i] = i;
    auto raiz = [&](uint32_t i) {
        while (g[i] != i) i = g[i] = g[g[i]];
        return i;
    };
    // folga de 3% da largura (0,06 em -1..1): o espaço entre letras e entre palavras; entre os blocos do HUD é bem mais
    for (uint32_t i = 0; i < n; i++)
        for (uint32_t j = i + 1; j < n; j++)
            if (encostadas(prev[i], prev[j], 0.06f)) g[raiz(j)] = raiz(i);
    std::vector<B> ext(n, B{1e30f, -1e30f, 1e30f, -1e30f});
    for (uint32_t i = 0; i < n; i++) {
        B &e = ext[raiz(i)];
        e.x0 = std::min(e.x0, prev[i].x0), e.x1 = std::max(e.x1, prev[i].x1);
        e.y0 = std::min(e.y0, prev[i].y0), e.y1 = std::max(e.y1, prev[i].y1);
    }
    prev_g.resize(n);
    for (uint32_t i = 0; i < n; i++) prev_g[i] = ext[raiz(i)];
}
void HudGrupos::expandir(float &x0, float &x1, float y0, float y1) {
    if (!(x0 <= x1) || !(y0 <= y1)) return;
    if (atual.size() < 1024) atual.push_back({x0, x1, y0, y1});
    const B eu{x0, x1, y0, y1};
    float a0 = x0, a1 = x1;
    for (size_t i = 0; i < prev.size(); i++) // a mesma caixa no quadro anterior (ou quase: o menu anima)
        if (encostadas(prev[i], eu, 0.005f)) a0 = std::min(a0, prev_g[i].x0), a1 = std::max(a1, prev_g[i].x1);
    x0 = a0, x1 = a1;
}

// Ultrawide: o HUD (FlashUI) encolhe f vezes na largura, cada grupo preso ao lado em que está: todo à esquerda do
// meio -> borda esquerda, todo à direita -> borda direita, cruzando o meio -> centro (menus, barra de chefe). Um
// desenho do jogo junta pedaços de lugares diferentes (a barra de vida e o contador de orbes no mesmo), então o
// lado é por grupo: triângulos ligados = pedaço; pedaços encostados (na mesma altura, ou um dentro do outro) = grupo.
// Pedaço de tela cheia (fundo, fade) fica esticado. Devolve se mexeu.
bool squeeze_hud_x(gvk::Draw &d, int pos, float f, std::vector<uint8_t> &copy, HudGrupos *hg) {
    const uint32_t nv = d.vertex_count;
    if (!nv || !d.index_data || (f >= 0.999f && f <= 1.001f)) return false;
    float *cpu = nullptr;
    uint8_t *raw = nullptr;
    uint32_t stride = 0;
    if (d.raw_attrs.empty()) {
        if ((uint32_t)pos >= d.attr_count) return false;
        cpu = const_cast<float *>(d.attrs) + (size_t)pos * nv * 4;
    } else {
        const gvk::VertexAttr *a = nullptr;
        for (const auto &x : d.raw_attrs)
            if (x.location == (uint32_t)pos) a = &x;
        if (!a || a->fmt != 9 || a->comps < 2) return false;
        gvk::VertexStream &st = d.raw_streams[a->stream];
        if (st.data != copy.data()) { // o texto já pode ter copiado este stream
            copy.assign(st.data, st.data + st.size);
            st.data = copy.data();
        }
        raw = copy.data() + a->offset, stride = st.stride;
    }
    auto xy = [&](uint32_t v, int c) -> float & {
        return cpu ? cpu[4 * v + c] : *reinterpret_cast<float *>(raw + (size_t)v * stride + 4 * c);
    };
    // pedaços: componentes ligadas pelos triângulos
    std::vector<uint32_t> up(nv);
    for (uint32_t v = 0; v < nv; v++) up[v] = v;
    auto root = [&](uint32_t v) {
        while (up[v] != v) v = up[v] = up[up[v]];
        return v;
    };
    auto index = [&](uint32_t i) -> int64_t {
        const int64_t r = d.index_size == 4 ? (int64_t)static_cast<const uint32_t *>(d.index_data)[i]
                                            : (int64_t)static_cast<const uint16_t *>(d.index_data)[i];
        return r + d.vertex_offset;
    };
    const uint32_t n = d.index_count;
    const uint32_t ntri = d.topology == 0 ? n / 3 : n >= 3 ? n - 2 : 0;
    std::vector<uint8_t> usado(nv, 0);
    for (uint32_t t = 0; t < ntri; t++) {
        int64_t i0, i1, i2;
        if (d.topology == 0) i0 = index(3 * t), i1 = index(3 * t + 1), i2 = index(3 * t + 2);
        else if (d.topology == 1) i0 = index(t), i1 = index(t + 1), i2 = index(t + 2);
        else i0 = index(0), i1 = index(t + 1), i2 = index(t + 2);
        if (i0 < 0 || i1 < 0 || i2 < 0 || i0 >= nv || i1 >= nv || i2 >= nv) continue;
        usado[i0] = usado[i1] = usado[i2] = 1;
        const float ax = xy((uint32_t)i1, 0) - xy((uint32_t)i0, 0), ay = xy((uint32_t)i1, 1) - xy((uint32_t)i0, 1);
        const float bx = xy((uint32_t)i2, 0) - xy((uint32_t)i0, 0), by = xy((uint32_t)i2, 1) - xy((uint32_t)i0, 1);
        if (std::fabs(ax * by - ay * bx) < 1e-9f) continue; // degenerado das faixas: não liga pedaços
        up[root((uint32_t)i1)] = root((uint32_t)i0);
        up[root((uint32_t)i2)] = root((uint32_t)i0);
    }
    struct Caixa { float x0 = 1e30f, x1 = -1e30f, y0 = 1e30f, y1 = -1e30f; };
    std::unordered_map<uint32_t, uint32_t> peca_de; // raiz -> índice do pedaço
    std::vector<Caixa> pecas;
    std::vector<uint32_t> peca_v(nv, UINT32_MAX);
    for (uint32_t v = 0; v < nv; v++) {
        if (!usado[v] || !std::isfinite(xy(v, 0)) || !std::isfinite(xy(v, 1))) continue;
        auto [it, novo] = peca_de.try_emplace(root(v), (uint32_t)pecas.size());
        if (novo) pecas.push_back({});
        Caixa &c = pecas[it->second];
        c.x0 = std::min(c.x0, xy(v, 0)), c.x1 = std::max(c.x1, xy(v, 0));
        c.y0 = std::min(c.y0, xy(v, 1)), c.y1 = std::max(c.y1, xy(v, 1));
        peca_v[v] = it->second;
    }
    if (pecas.empty()) return false;
    // grupos: pedaços encostados (folga de 3% da tela na largura) e com altura em comum; os de tela cheia (fundo, fade)
    // não se mexem e não juntam nada
    const uint32_t np = (uint32_t)pecas.size();
    auto cheia = [&](uint32_t i) { return pecas[i].x1 - pecas[i].x0 >= 1.9f; };
    std::vector<uint32_t> grp(np);
    for (uint32_t i = 0; i < np; i++) grp[i] = i;
    auto gr = [&](uint32_t i) {
        while (grp[i] != i) i = grp[i] = grp[grp[i]];
        return i;
    };
    if (np <= 4096)
        for (uint32_t i = 0; i < np; i++)
            for (uint32_t j = i + 1; j < np; j++) {
                if (cheia(i) || cheia(j)) continue;
                const Caixa &a = pecas[i], &b = pecas[j];
                const bool perto_x = a.x0 <= b.x1 + 0.06f && b.x0 <= a.x1 + 0.06f;
                const bool mesma_altura = a.y0 <= b.y1 && b.y0 <= a.y1;
                if (perto_x && mesma_altura) grp[gr(j)] = gr(i);
            }
    std::vector<Caixa> grupos(np);
    for (uint32_t i = 0; i < np; i++) {
        Caixa &g = grupos[gr(i)];
        const Caixa &c = pecas[i];
        g.x0 = std::min(g.x0, c.x0), g.x1 = std::max(g.x1, c.x1);
        g.y0 = std::min(g.y0, c.y0), g.y1 = std::max(g.y1, c.y1);
    }
    // o lado sai do grupo entre desenhos (o GoW manda uma letra ou um trecho por desenho)
    if (hg)
        for (uint32_t i = 0; i < np; i++)
            if (gr(i) == i && !cheia(i)) hg->expandir(grupos[i].x0, grupos[i].x1, grupos[i].y0, grupos[i].y1);
    static int diag = getenv("VITART_UI_LOG") ? 400 : 0; // diagnóstico: os pedaços e grupos dos primeiros desenhos
    static int conta = 0;
    if (diag > 0 && ++conta % 40 == 0) {
        diag--;
        std::string t;
        char buf[96];
        for (uint32_t i = 0; i < np && i < 24; i++) {
            const Caixa &c = pecas[i], &g = grupos[gr(i)];
            std::snprintf(buf, sizeof buf, " [%.2f..%.2f y%.2f..%.2f g%.2f..%.2f]", c.x0, c.x1, c.y0, c.y1, g.x0, g.x1);
            t += buf;
        }
        if (FILE *lf = std::fopen("hud_pecas.log", "a")) std::fprintf(lf, "%u pedacos%s\n", np, t.c_str()), std::fclose(lf);
    }
    bool mexeu = false;
    for (uint32_t v = 0; v < nv; v++) {
        if (peca_v[v] == UINT32_MAX) continue;
        const Caixa &c = pecas[peca_v[v]];
        if (c.x1 - c.x0 >= 1.9f) continue; // tela cheia
        const Caixa &g = grupos[gr(peca_v[v])];
        const float anc = g.x1 <= 0.02f ? -1.f : g.x0 >= -0.02f ? 1.f : 0.f;
        xy(v, 0) = anc + (xy(v, 0) - anc) * f;
        mexeu = true;
    }
    return mexeu;
}
