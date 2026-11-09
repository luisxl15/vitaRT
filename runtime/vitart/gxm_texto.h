// Texto da interface na proporção 4:3 (gxm_texto.cpp).
#pragma once
#include "gxm_vk.h"

#include <cstdint>
#include <vector>

// Ultrawide: o jogo desenha o HUD em vários desenhos (no GoW1 é uma letra ou um trecho por desenho), então o lado de
// cada pedaço não sai de um desenho só: "CONTINUE" virava "Co" na borda esquerda, "NTIN" no meio e "UE" na direita.
// Aqui ficam as caixas de todos os desenhos do HUD de um quadro; no seguinte, cada caixa que cai no mesmo lugar ganha
// a extensão do grupo dela (caixas encostadas na mesma altura = uma linha, um painel). Coordenada de tela, -1..1.
struct HudGrupos {
    struct B {
        float x0, x1, y0, y1;
    };
    void quadro(uint32_t f); // vira o quadro: agrupa as caixas do anterior
    // registra a caixa e devolve em x0/x1 a extensão do grupo em que ela estava no quadro anterior (ou ela mesma)
    void expandir(float &x0, float &x1, float y0, float y1);

  private:
    std::vector<B> atual, prev, prev_g;
    uint32_t q = UINT32_MAX;
};

bool squeeze_text_lines(gvk::Draw &d, int pos, float s, std::vector<uint8_t> &copy);
bool squeeze_hud_x(gvk::Draw &d, int pos, float f, std::vector<uint8_t> &copy, HudGrupos *hg = nullptr);
