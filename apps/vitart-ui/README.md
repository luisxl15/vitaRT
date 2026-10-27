# vitart Troféus e vitart Mod Studio

As duas telas em Electron. São o mesmo código: o nome do exe (ou `--app=trofeus` / `--app=modstudio`) decide qual
abre. O trabalho de verdade continua nas ferramentas em Python do repositório. `main.js` roda a
`tools/vitart_ponte.py` como processo filho, e os dois conversam em JSON, uma mensagem por linha.

```
renderer/            HTML, CSS e JS das telas (comum.* = barra de título, avisos, animações)
main.js              janela sem moldura, ponte com o Python, diálogos
preload.js           o que a página enxerga (window.vt)
../../tools/vitart_ponte.py   troféus, mods, conversão, texturas, textos, configuração
../../tools/vitart_arte.py    arte tirada do jogo de quem usa -> <vitart-data>/ui-arte
```

## Arte

Nenhuma imagem do jogo vai no repositório. Na primeira vez que abre, o `vitart_arte.py` tira a arte do próprio
jogo instalado:
- do `sce_sys`: o pic0 (Kratos contra a Hidra) e o ômega;
- dos WADs:
  - o título do GoW1;
  - as Lâminas do Caos;
  - o ômega do HUD;
  - o friso dourado e o meandro grego;
  - o medalhão de Zeus;
  - a águia e a moldura de bronze.

Com o Real-ESRGAN em `_deps/realesrgan`, as imagens pequenas são ampliadas 4x. As fontes são Constantia e Palatino,
que vêm com o Windows. As animações usam a Web Animations API, sem biblioteca, e respeitam
`prefers-reduced-motion`.

## Rodar e empacotar

O Electron 31 não vem no git. Copie a pasta `node_modules/electron` de outro projeto que tenha a mesma versão, ou
rode `npm install`.

```
npm run trofeus          # ou: npm run modstudio
python tools/build_vitart_ui.py            # -> ../gow-dump/rt/vitart-ui
```

O empacotamento faz quatro coisas:
1. copia o Electron;
2. põe o app em `resources/app`, com um `repo.json` que diz onde está o repositório;
3. grava o ícone do ômega no exe (pela API do Windows, sem rcedit);
4. cria o `vitart Mod Studio.exe` como hard link do `vitart Troféus.exe`.

Precisa do Python com `numpy` e `Pillow`, os mesmos do resto das ferramentas.

## Conferir o visual sem mexer na tela

`VITART_UI_CAPTURA=saida.png` fotografa a própria janela depois de `VITART_UI_ESPERA` ms e fecha.
`VITART_UI_JS` roda um trecho antes, por exemplo para clicar numa aba. O console da página sai no terminal.

As versões antigas em Tkinter (`tools/vitart_trofeus.py`, `tools/vitart_modstudio.py`) ainda funcionam. A ponte usa
o leitor de troféus da primeira.
