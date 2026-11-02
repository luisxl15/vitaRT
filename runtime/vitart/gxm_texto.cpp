// Texto da interface na proporção 4:3 (o porquê está em squeeze_text, hle_gxm.cpp): a geometria, separada para
// o teste em tests/texto_4x3 rodar sem o jogo.
#include "gxm_texto.h"

#include <algorithm>
#include <cmath>
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
