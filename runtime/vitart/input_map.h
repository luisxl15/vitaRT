// mapeamento de teclado/mouse e de controle que o jogador escolhe (o Settings grava <dados>/controles_<jogo>.ini)
#pragma once

#include <cstdint>

namespace vt::inmap {

struct Teclado {
    uint32_t buttons = 0;   // bits do SceCtrlData
    int mx = 0, my = 0;     // direção das teclas de andar (-1, 0, 1)
    bool roll = false;      // a direção vai pro analógico direito
};

// teclado e mouse agora (só com a janela em foco quem chama decide)
Teclado teclado();
// botões físicos do controle (bits do SceCtrlData na posição de fábrica) -> botões que o jogo recebe
uint32_t controle(uint32_t fisicos);

} // namespace vt::inmap
