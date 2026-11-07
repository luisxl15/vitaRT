// Texto da interface na proporção 4:3 (gxm_texto.cpp).
#pragma once
#include "gxm_vk.h"

bool squeeze_text_lines(gvk::Draw &d, int pos, float s, std::vector<uint8_t> &copy);
bool squeeze_hud_x(gvk::Draw &d, int pos, float f, std::vector<uint8_t> &copy);
