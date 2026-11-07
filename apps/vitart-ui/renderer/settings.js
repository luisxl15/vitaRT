// vitart Settings: a API de vídeo do jogo (renderer= no vitart_options.ini), o mapa de teclado/mouse e de controle
// (controles_<jogo>.ini, que o runtime lê em input_map.cpp) e as opções de diagnóstico.
const NAV_ICO = {
  video: '<rect x="1.5" y="3" width="13" height="8.5"/><path d="M5.5 14h5M8 11.5V14"/>',
  ctl: '<rect x="1.5" y="4.5" width="13" height="7.5" rx="1"/><path d="M4 7h1M6.5 7h1M9 7h1M11.5 7h1M4.5 9.5h7"/>',
  avan: '<path d="M2 4h7M12 4h2M2 8h2M7 8h7M2 12h9M14 12h0"/><circle cx="10.5" cy="4" r="1.5"/><circle cx="5.5" cy="8" r="1.5"/><circle cx="12.5" cy="12" r="1.5"/>',
};
const SECOES = [
  { id: 'video', nome: 'Gráficos', sobre: 'API de vídeo', titulo: 'Gráficos', arte: 'rocha',
    sub: 'Escolha com que API o jogo desenha. A troca vale na próxima vez que o jogo abrir.' },
  { id: 'ctl', nome: 'Controles', sobre: 'Teclado, mouse e controle', titulo: 'Controles', arte: 'chave',
    sub: 'O esquema do God of War (2018) de PC, com cada tecla e botão trocável.' },
  { id: 'avan', nome: 'Avançado', sobre: 'Diagnóstico', titulo: 'Avançado', arte: 'rocha',
    sub: 'Janela de console, registro e dump das texturas originais. Valem na próxima vez que o jogo abrir.' },
];
const st = { secao: null, opcoes: null, jogo: 2 };

// ------------------------------------------------------------------ navegação (a mesma do Mod Studio)
function montarNav() {
  $('#nav').replaceChildren(...SECOES.map(s => el('button', { 'data-s': s.id, onclick: () => abrir(s.id) },
    el('span', { html: `<svg viewBox="0 0 16 16" aria-hidden="true">${NAV_ICO[s.id]}</svg>` }).firstChild, s.nome)));
  $('#secoes').replaceChildren(...SECOES.map(s => el('section', { class: 'secao', id: 's-' + s.id })));
}
function abrir(id) {
  if (st.secao === id) return;
  const s = SECOES.find(x => x.id === id);
  st.secao = id;
  $$('#nav button').forEach(b => { if (b.dataset.s === id) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  $('#cab-sobre').textContent = s.sobre;
  $('#cab-titulo').textContent = s.titulo;
  $('#cab-sub').textContent = s.sub;
  const arte = $('#cab-arte');
  arte.style.backgroundImage = `var(--arte-${s.arte}, none)`;
  arte.style.backgroundSize = s.arte === 'rocha' ? '420px' : 'cover';
  arte.style.backgroundRepeat = s.arte === 'rocha' ? 'repeat' : 'no-repeat';
  animar(arte, [{ opacity: 0, transform: 'scale(1.05)' }, { opacity: 1, transform: 'none' }], 700);
  animar($('.cab-corpo'), [{ opacity: 0, transform: 'translateX(-14px)' }, { opacity: 1, transform: 'none' }], 450);
  $$('.secao').forEach(x => x.classList.toggle('ativa', x.id === 's-' + id));
  const sec = $('#s-' + id);
  if (!sec.dataset.pronta) { sec.dataset.pronta = '1'; MONTAR[id](sec); }
  animar(sec, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], 380);
}

// ------------------------------------------------------------------ Gráficos
const APIS = [
  { id: 'auto', nome: 'Automático', selo: 'Recomendado',
    texto: 'Vulkan quando houver driver e placa com suporte; senão Direct3D 11, e o WARP do Windows como último recurso.' },
  { id: 'vulkan', nome: 'Vulkan', selo: '',
    texto: 'O renderizador principal do vitart, onde tudo é testado primeiro. Precisa de um driver de vídeo com Vulkan.' },
  { id: 'd3d11', nome: 'Direct3D 11', selo: '',
    texto: 'Alternativa para placas ou drivers sem Vulkan. Os mesmos shaders do jogo, traduzidos para o Direct3D.' },
];
const NOME_API = { vulkan: 'Vulkan', d3d11: 'Direct3D 11' };

function montarVideo(sec) {
  sec.append(
    el('div', { class: 'nota oculto', id: 'aviso-jogo' }, 'O jogo está aberto: a troca vale quando ele abrir de novo.'),
    el('div', { class: 'apis', id: 'apis', role: 'radiogroup', 'aria-label': 'API de vídeo' }),
    el('div', { class: 'video-info painel' },
      el('div', {}, el('div', { class: 'caixa' }, 'Placa de vídeo'), el('div', { class: 'valor', id: 'v-placa', 'data-no-i18n': '' }, '...')),
      el('div', {}, el('div', { class: 'caixa' }, 'Última sessão'), el('div', { class: 'valor', id: 'v-ultima' }, '...')),
      el('div', {}, el('div', { class: 'caixa' }, 'Arquivo de opções'), el('div', { class: 'valor fino', id: 'v-ini', 'data-no-i18n': '' }, '...'))));
  pintarApis();
}

function pintarApis() {
  const o = st.opcoes;
  if (!o) return;
  $('#apis').replaceChildren(...APIS.map(a => {
    const semVulkan = a.id === 'vulkan' && !o.vulkan;
    return el('button', { class: 'api' + (o.api === a.id ? ' sel' : ''), role: 'radio', 'aria-checked': String(o.api === a.id), onclick: () => escolherApi(a.id) },
      el('span', { class: 'api-marca', html: icone('check') }),
      el('span', { class: 'api-nome' }, a.nome),
      a.selo ? el('span', { class: 'selo' }, a.selo) : null,
      el('span', { class: 'api-texto' }, a.texto),
      semVulkan ? el('span', { class: 'api-alerta' }, 'Não achei o driver Vulkan (vulkan-1.dll) neste PC.') : null,
      o.ultima && a.id === o.ultima.api ? el('span', { class: 'api-uso' }, 'Em uso na última sessão') : null,
      o.ultima && a.id === 'auto' && o.api === 'auto' ? el('span', { class: 'api-uso' }, tr('Na última sessão escolheu {a}', { a: NOME_API[o.ultima.api] })) : null);
  }));
  $('#v-placa').textContent = o.placas.length ? o.placas.join(' · ') : '?';
  $('#v-ultima').textContent = o.ultima ? tr('{a} em {b}', { a: NOME_API[o.ultima.api], b: new Date(o.ultima.quando * 1000).toLocaleString(IDIOMA) }) : tr('Ainda sem registro');
  $('#v-ini').textContent = o.ini;
  $('#aviso-jogo').classList.toggle('oculto', !o.jogo_aberto);
}

async function escolherApi(id) {
  if (st.opcoes.api === id) return;
  try {
    await vt.rpc('salvar_api', { api: id });
    st.opcoes.api = id;
    pintarApis();
    cascata($$('.api.sel'), [{ transform: 'scale(.985)' }, { transform: 'none' }], 0, 260);
    avisar('Salvo', st.opcoes.jogo_aberto ? 'Vale quando o jogo abrir de novo.' : 'Vale na próxima vez que o jogo abrir.');
  } catch (e) { avisar('Não deu', e.message, 'erro'); }
}

// ------------------------------------------------------------------ Controles
// O mapa vem de <dados>/controles_<jogo>.ini (runtime/vitart/input_map.cpp lê, até com o jogo aberto); sem o arquivo,
// o padrão de games/gow/gow_profile.cpp (a ponte tem a mesma lista). Cada linha é uma ação do Vita: clicar captura a
// tecla nova; Shift/Ctrl/Alt + tecla vira combinação. O controle troca botão por botão.
const GRUPOS = { mov: 'Movimento', luta: 'Combate', acao: 'Interação', menu: 'Menus', janela: 'Janela (vitart)' };
const ACOES = [
  { id: 'andar_cima', g: 'mov', b: 'Analógico ↑', a: 'Andar para a frente' },
  { id: 'andar_baixo', g: 'mov', b: 'Analógico ↓', a: 'Andar para trás' },
  { id: 'andar_esquerda', g: 'mov', b: 'Analógico ←', a: 'Andar para a esquerda' },
  { id: 'andar_direita', g: 'mov', b: 'Analógico →', a: 'Andar para a direita' },
  { id: 'analogico_direito', g: 'mov', b: 'Analógico direito', a: 'Segurando, as teclas de andar esquivam / rolam' },
  { id: 'cruz', g: 'mov', b: '✕ Cruz', a: 'Pular', gow2: 'Pular; segurado no ar, plana com as asas de Ícaro' },
  { id: 'quadrado', g: 'luta', b: '□ Quadrado', a: 'Ataque leve' },
  { id: 'triangulo', g: 'luta', b: '△ Triângulo', a: 'Ataque pesado' },
  { id: 'circulo', g: 'luta', b: '○ Círculo', a: 'Agarrar (e os QTEs de círculo)' },
  { id: 'furia', g: 'luta', b: 'L3 + R3', a: 'Rage of the Gods', gow2: 'Rage of the Titans' },
  { id: 'l1', g: 'luta', b: 'L1', a: 'Defender / aparar', gow2: 'Defender; com o Golden Fleece, refletir' },
  { id: 'l2', g: 'luta', b: 'L2', a: 'Magia', gow2: 'Item' },
  { id: 'r2', g: 'acao', b: 'R2', a: 'Interagir (baús, portas, alavancas)', gow2: 'O outro botão R' },
  { id: 'r1', g: 'acao', b: 'R1', a: 'O outro botão R', gow2: 'Interagir (baús, portas, alavancas)' },
  { id: 'amuleto', g: 'acao', b: 'L1 + R1', a: 'Amuleto das Moiras (congela o tempo)', so: 2 },
  { id: 'cima', g: 'menu', b: 'Direcional ↑', a: 'Magia do direcional para cima; navegar nos menus' },
  { id: 'direita', g: 'menu', b: 'Direcional →', a: 'Magia do direcional para a direita; navegar nos menus' },
  { id: 'baixo', g: 'menu', b: 'Direcional ↓', a: 'Magia do direcional para baixo; navegar nos menus' },
  { id: 'esquerda', g: 'menu', b: 'Direcional ←', a: 'Magia do direcional para a esquerda; navegar nos menus' },
  { id: 'select', g: 'menu', b: 'SELECT', a: 'Pausa' },
  { id: 'start', g: 'menu', b: 'START', a: 'Power Up (melhorar armas e magias)' },
];
// fixas do vitart (gxm_window.cpp), não entram no arquivo
const FIXAS = [
  { g: 'janela', t: ['F11', 'ALT+ENTER'], a: 'Tela cheia / janela' },
  { g: 'janela', t: ['F9'], a: 'Capturar o quadro seguinte (diagnóstico, vai para a pasta capturas)' },
];
// botões do controle (nome no ini -> rótulo); a ordem é a da tela
const FISICOS = { CRUZ: '✕ Cruz / A', CIRCULO: '○ Círculo / B', QUADRADO: '□ Quadrado / X', TRIANGULO: '△ Triângulo / Y',
  L1: 'L1 / LB', R1: 'R1 / RB', L2: 'L2 / LT', R2: 'R2 / RT', L3: 'L3 (analógico esquerdo)', R3: 'R3 (analógico direito)',
  SELECT: 'Share / View', START: 'Options / Menu', CIMA: 'Direcional ↑', DIREITA: 'Direcional →', BAIXO: 'Direcional ↓',
  ESQUERDA: 'Direcional ←', NADA: '— nenhum —' };
const ACOES_CONTROLE = ['cruz', 'circulo', 'quadrado', 'triangulo', 'l1', 'r1', 'l2', 'r2', 'l3', 'r3', 'select', 'start',
  'cima', 'direita', 'baixo', 'esquerda'];
const ROTULO_ACAO = { l3: 'L3 (fúria, junto do R3)', r3: 'R3 (fúria, junto do L3)' };

// nome no ini (input_map.cpp) -> tecla do desenho
const DESENHO = { SPACE: 'Space', LBUTTON: 'LMB', RBUTTON: 'RMB', MBUTTON: 'MMB', LCTRL: 'LCtrl', CTRL: 'LCtrl', RCTRL: 'RCtrl',
  SHIFT: 'Shift', LSHIFT: 'Shift', RSHIFT: 'Shift', ALT: 'Alt', LALT: 'Alt', RALT: 'Alt', TAB: 'Tab', ENTER: 'Enter', RETURN: 'Enter',
  ESCAPE: 'Esc', ESC: 'Esc', BACKSPACE: 'Backspace', BACK: 'Backspace', UP: 'Up', DOWN: 'Down', LEFT: 'Left', RIGHT: 'Right',
  CAPSLOCK: 'Caps', TILDE: '`', MINUS: '-', PLUS: '=', LBRACKET: '[', RBRACKET: ']', BACKSLASH: '\\', SEMICOLON: ';', QUOTE: "'",
  COMMA: ',', PERIOD: '.', SLASH: '/' };
const NOME_TECLA = { Space: 'Espaço', LMB: 'Botão esquerdo', RMB: 'Botão direito', MMB: 'Botão do meio', LCtrl: 'Ctrl esquerdo',
  RCtrl: 'Ctrl direito', Up: '↑', Down: '↓', Left: '←', Right: '→', Backspace: 'Backspace', Enter: 'Enter', Esc: 'Esc', Tab: 'Tab',
  Shift: 'Shift', Alt: 'Alt', Caps: 'Caps Lock', XBUTTON1: 'Mouse 4', XBUTTON2: 'Mouse 5' };
// KeyboardEvent.code -> nome no ini
function nomeDoCodigo(c) {
  if (/^Key[A-Z]$/.test(c)) return c.slice(3);
  if (/^Digit[0-9]$/.test(c)) return c.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(c)) return c;
  if (/^Numpad[0-9]$/.test(c)) return 'NUM' + c.slice(6);
  return ({ Space: 'SPACE', ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT', ControlLeft: 'LCTRL', ControlRight: 'RCTRL', AltLeft: 'ALT',
    AltRight: 'ALT', Tab: 'TAB', Enter: 'ENTER', NumpadEnter: 'ENTER', Escape: 'ESCAPE', Backspace: 'BACKSPACE', ArrowUp: 'UP',
    ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', CapsLock: 'CAPSLOCK', Backquote: 'TILDE', Minus: 'MINUS',
    Equal: 'PLUS', BracketLeft: 'LBRACKET', BracketRight: 'RBRACKET', Backslash: 'BACKSLASH', Semicolon: 'SEMICOLON',
    Quote: 'QUOTE', Comma: 'COMMA', Period: 'PERIOD', Slash: 'SLASH', Insert: 'INSERT', Delete: 'DELETE', Home: 'HOME',
    End: 'END', PageUp: 'PAGEUP', PageDown: 'PAGEDOWN' })[c] || null;
}
const MOD = { SHIFT: 1, LCTRL: 1, RCTRL: 1, ALT: 1 };
const BOTAO_MOUSE = ['LBUTTON', 'MBUTTON', 'RBUTTON', 'XBUTTON1', 'XBUTTON2'];

// teclado desenhado: [id, rótulo, largura em unidades]; null = espaço
const TECLADO = [
  [['Esc', 'Esc', 1], null, ['F1', 'F1', 1], ['F2', 'F2', 1], ['F3', 'F3', 1], ['F4', 'F4', 1], null, ['F5', 'F5', 1], ['F6', 'F6', 1], ['F7', 'F7', 1], ['F8', 'F8', 1], null, ['F9', 'F9', 1], ['F10', 'F10', 1], ['F11', 'F11', 1], ['F12', 'F12', 1]],
  [['`', '`', 1], ['1', '1', 1], ['2', '2', 1], ['3', '3', 1], ['4', '4', 1], ['5', '5', 1], ['6', '6', 1], ['7', '7', 1], ['8', '8', 1], ['9', '9', 1], ['0', '0', 1], ['-', '-', 1], ['=', '=', 1], ['Backspace', '⟵', 2]],
  [['Tab', 'Tab', 1.5], ['Q', 'Q', 1], ['W', 'W', 1], ['E', 'E', 1], ['R', 'R', 1], ['T', 'T', 1], ['Y', 'Y', 1], ['U', 'U', 1], ['I', 'I', 1], ['O', 'O', 1], ['P', 'P', 1], ['[', '[', 1], [']', ']', 1], ['\\', '\\', 1.5]],
  [['Caps', 'Caps', 1.75], ['A', 'A', 1], ['S', 'S', 1], ['D', 'D', 1], ['F', 'F', 1], ['G', 'G', 1], ['H', 'H', 1], ['J', 'J', 1], ['K', 'K', 1], ['L', 'L', 1], [';', ';', 1], ["'", "'", 1], ['Enter', 'Enter', 2.25]],
  [['Shift', 'Shift', 2.25], ['Z', 'Z', 1], ['X', 'X', 1], ['C', 'C', 1], ['V', 'V', 1], ['B', 'B', 1], ['N', 'N', 1], ['M', 'M', 1], [',', ',', 1], ['.', '.', 1], ['/', '/', 1], ['Shift', 'Shift', 2.75]],
  [['LCtrl', 'Ctrl', 1.5], ['Win', 'Win', 1.25], ['Alt', 'Alt', 1.25], ['Space', '', 6.5], ['Alt', 'Alt', 1.25], ['Win', 'Win', 1.25], ['Menu', '☰', 1], ['RCtrl', 'Ctrl', 1.5]],
];
const SETAS = [[null, ['Up', '↑', 1], null], [['Left', '←', 1], ['Down', '↓', 1], ['Right', '→', 1]]];

const ctl = { dados: {}, captura: null };
const tagJogo = () => (st.jogo === 2 ? 'gow2' : 'gow1');

function linhasDoJogo() {
  const tec = ctl.dados[tagJogo()]?.atual.teclado || {};
  return ACOES.filter(l => !l.so || l.so === st.jogo).map(l => ({
    ...l, acao: st.jogo === 2 && l.gow2 ? l.gow2 : l.a, t: tec[l.id] || [], editavel: true,
  })).concat(FIXAS.map(f => ({ ...f, b: '', acao: f.a, editavel: false })));
}
const desenhoDe = n => DESENHO[n] || n;
const teclasDe = combos => [...new Set(combos.flatMap(c => c.split('+').map(desenhoDe)))];

async function carregarCtl(forcar) {
  const j = tagJogo();
  if (!ctl.dados[j] || forcar) ctl.dados[j] = await vt.rpc('controles', { jogo: j });
}
async function salvarCtl(mudar) {
  const j = tagJogo(), d = ctl.dados[j];
  const novo = { teclado: { ...d.atual.teclado }, controle: { ...d.atual.controle } };
  mudar(novo);
  try {
    ctl.dados[j] = await vt.rpc('salvar_controles', { jogo: j, ...novo });
    pintarCtl();
    avisar('Salvo', st.opcoes?.jogo_aberto ? 'Já vale no jogo aberto.' : 'Vale quando o jogo abrir.');
  } catch (e) { avisar('Não deu', e.message, 'erro'); }
}

function montarCtl(sec) {
  sec.append(
    el('div', { class: 'barra-acoes' },
      el('div', { class: 'jogos', role: 'tablist', 'aria-label': 'Jogo' },
        ...[[1, 'God of War'], [2, 'God of War II']].map(([g, n]) =>
          el('button', { role: 'tab', 'data-g': g, 'data-no-i18n': '', onclick: async () => { st.jogo = g; await carregarCtl(); pintarCtl(); } }, n))),
      el('div', { class: 'direita' },
        el('span', { class: 'mudo legenda' }, 'Clique numa linha para trocar a tecla.'),
        el('button', { class: 'btn fino', onclick: restaurarCtl }, 'Restaurar padrão'))),
    el('div', { class: 'ctl-topo' },
      el('div', { class: 'teclado painel', id: 'teclado' }),
      el('div', { class: 'mouse painel' }, el('div', { class: 'mouse-corpo', id: 'mouse' }), el('div', { class: 'caixa' }, 'Mouse'))),
    el('div', { class: 'mapa', id: 'mapa' }),
    el('h2', { class: 'titulo ctl-sub' }, 'Controle'),
    el('div', { class: 'nota' }, 'Xbox, DualShock 4 e DualSense. Escolha que botão do controle faz cada ação do Vita. Os analógicos ficam como estão.'),
    el('div', { class: 'controle-mapa painel', id: 'controle-mapa' }),
    el('div', { class: 'nota' }, 'O teclado só vale com a janela do jogo em foco. Controles funcionam ao mesmo tempo, e os ícones dos botões seguem o último que você usou. A cruz (✕) também pula as cenas em vídeo. O jogo relê o arquivo sozinho: dá para trocar com ele aberto.'),
    el('div', { class: 'captura oculto', id: 'captura' },
      el('div', { class: 'captura-caixa painel' },
        el('div', { class: 'caixa', id: 'captura-acao' }),
        el('div', { class: 'captura-titulo titulo' }, 'Aperte a tecla ou o botão do mouse'),
        el('div', { class: 'mudo', id: 'captura-dica' }, 'Segure Shift, Ctrl ou Alt antes para fazer uma combinação.'),
        el('div', { class: 'captura-botoes' },
          el('button', { class: 'btn fino', onclick: () => fimCaptura(null, 'limpar') }, 'Sem tecla'),
          el('button', { class: 'btn fino', onclick: () => fimCaptura(null) }, 'Cancelar')))));
  montarTeclado();
  carregarCtl().then(pintarCtl).catch(e => avisar('Controles', e.message, 'erro'));
  ligarCaptura();
}

function tecla([id, rot, w]) {
  return el('div', { class: 'tecla', 'data-k': id, style: { flexGrow: w, flexBasis: 0 }, 'data-no-i18n': '' }, rot);
}
function montarTeclado() {
  const linha = l => el('div', { class: 'tlinha' }, ...l.map(k => k ? tecla(k) : el('div', { class: 'tvao' })));
  $('#teclado').replaceChildren(
    el('div', { class: 'tprincipal' }, ...TECLADO.map(linha)),
    el('div', { class: 'tsetas' }, ...SETAS.map(l => el('div', { class: 'tlinha' }, ...l.map(k => k ? tecla(k) : el('div', { class: 'tvao', style: { flexGrow: 1, flexBasis: 0 } }))))));
  $('#mouse').replaceChildren(
    el('div', { class: 'tecla mb e', 'data-k': 'LMB', 'aria-label': 'Botão esquerdo' }),
    el('div', { class: 'tecla mb m', 'data-k': 'MMB', 'aria-label': 'Botão do meio' }),
    el('div', { class: 'tecla mb d', 'data-k': 'RMB', 'aria-label': 'Botão direito' }));
  $$('.tecla').forEach(t => {
    t.addEventListener('mouseenter', () => destacar(t.dataset.k, null));
    t.addEventListener('mouseleave', () => destacar(null, null));
  });
}

function capa(nome) {
  const id = desenhoDe(nome);
  return el('kbd', {}, NOME_TECLA[id] ? tr(NOME_TECLA[id]) : NOME_TECLA[nome] ? tr(NOME_TECLA[nome]) : id);
}
function pintarCtl() {
  if (!$('#mapa')) return;
  $$('.jogos button').forEach(b => b.setAttribute('aria-selected', String(+b.dataset.g === st.jogo)));
  const linhas = linhasDoJogo();
  // tecla -> grupo, e teclas repetidas em duas ações (aviso)
  const usadas = new Map(), donos = new Map();
  linhas.forEach(l => l.t.forEach(c => {
    teclasDe([c]).forEach(k => usadas.has(k) || usadas.set(k, l.g));
    if (l.editavel) donos.set(c, (donos.get(c) || 0) + 1);
  }));
  $$('.tecla').forEach(t => { t.dataset.g = usadas.get(t.dataset.k) || ''; t.classList.toggle('usada', usadas.has(t.dataset.k)); });
  $('#mapa').replaceChildren(...Object.entries(GRUPOS).map(([g, nome]) => {
    const ls = linhas.filter(l => l.g === g);
    return el('div', { class: 'grupo', 'data-g': g },
      el('h3', { class: 'caixa' }, nome),
      ...ls.map(l => {
        const chips = l.t.flatMap((alt, j) => [
          j ? el('span', { class: 'ou' }, 'ou') : null,
          el('span', { class: 'combo' + (donos.get(alt) > 1 ? ' repetida' : ''), title: donos.get(alt) > 1 ? tr('Também usada em outra ação') : '' },
            ...alt.split('+').flatMap((parte, k) => [k ? el('span', { class: 'mais' }, '+') : null, capa(parte)]),
            l.editavel ? el('button', { class: 'tira', 'aria-label': tr('Tirar'), onclick: ev => { ev.stopPropagation(); tirarTecla(l.id, j); } }, '×') : null),
        ]);
        const r = el('div', { class: 'linha' + (l.editavel ? ' editavel' : '') },
          el('div', { class: 'teclas' }, ...(chips.length ? chips : [el('span', { class: 'mudo' }, l.editavel ? 'sem tecla' : '')]),
            l.editavel ? el('button', { class: 'mais-tecla', 'aria-label': tr('Adicionar outra tecla'), title: tr('Adicionar outra tecla'),
              onclick: ev => { ev.stopPropagation(); iniciarCaptura(l, l.t.length); } }, '+') : null),
          el('div', { class: 'botao' }, l.b || '—'),
          el('div', { class: 'acao' }, l.acao));
        if (l.editavel) r.addEventListener('click', () => iniciarCaptura(l, 0));
        r.addEventListener('mouseenter', () => destacar(null, teclasDe(l.t)));
        r.addEventListener('mouseleave', () => destacar(null, null));
        r.dataset.teclas = teclasDe(l.t).join(' ');
        return r;
      }));
  }));
  pintarControle();
  cascata($$('#mapa .linha'), [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], 10, 260);
}

function pintarControle() {
  const d = ctl.dados[tagJogo()];
  if (!d) return;
  const nomeAcao = id => ROTULO_ACAO[id] || (ACOES.find(a => a.id === id)?.b || id);
  $('#controle-mapa').replaceChildren(...ACOES_CONTROLE.map(id => el('label', { class: 'ctl-linha' },
    el('span', { class: 'ctl-acao' }, nomeAcao(id)),
    el('select', { onchange: e => salvarCtl(n => { n.controle[id] = e.target.value; }) },
      ...Object.entries(FISICOS).map(([k, rot]) => el('option', { value: k, selected: d.atual.controle[id] === k ? true : null }, rot))),
    d.atual.controle[id] !== d.padrao.controle[id] ? el('span', { class: 'ctl-mudou', title: tr('Diferente do padrão') }, '●') : null)));
}

function destacar(k, teclas) {
  const on = new Set(teclas || (k ? [k] : []));
  $$('.tecla').forEach(t => t.classList.toggle('acesa', on.has(t.dataset.k)));
  $$('#mapa .linha').forEach(r => r.classList.toggle('acesa', !!k && r.dataset.teclas.split(' ').includes(k)));
}

function tirarTecla(id, j) {
  salvarCtl(n => { n.teclado[id] = n.teclado[id].filter((_, i) => i !== j); });
}
async function restaurarCtl() {
  if (!(await confirmar('Restaurar padrão', 'Volta o teclado, o mouse e o controle deste jogo ao esquema original.', 'Restaurar'))) return;
  const p = ctl.dados[tagJogo()].padrao;
  salvarCtl(n => { n.teclado = { ...p.teclado }; n.controle = { ...p.controle }; });
}

// captura: a próxima tecla (com Shift/Ctrl/Alt segurados vira combinação) ou botão do mouse
function iniciarCaptura(l, idx) {
  ctl.captura = { id: l.id, idx, mods: new Set(), soltar: null };
  $('#captura-acao').textContent = `${l.b} · ${l.acao || l.a}`;
  const c = $('#captura');
  c.classList.remove('oculto');
  animar($('.captura-caixa'), [{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }], 220);
}
function fimCaptura(nome, como) {
  const c = ctl.captura;
  ctl.captura = null;
  $('#captura').classList.add('oculto');
  if (!c || (!nome && como !== 'limpar')) return;
  salvarCtl(n => {
    const lista = [...(n.teclado[c.id] || [])];
    if (como === 'limpar') lista.splice(c.idx, 1);
    else if (c.idx < lista.length) lista[c.idx] = nome;
    else lista.push(nome);
    n.teclado[c.id] = [...new Set(lista)];
  });
}
function ligarCaptura() {
  const combinado = base => {
    const m = [...ctl.captura.mods].filter(x => x !== base);
    return m.length ? m.join('+') + '+' + base : base;
  };
  window.addEventListener('keydown', e => {
    if (!ctl.captura) return;
    e.preventDefault();
    e.stopPropagation();
    const n = nomeDoCodigo(e.code);
    if (!n) return;
    if (MOD[n]) { ctl.captura.mods.add(n === 'RCTRL' ? 'LCTRL' : n); return; }
    fimCaptura(combinado(n));
  }, true);
  window.addEventListener('keyup', e => {
    if (!ctl.captura) return;
    const n = nomeDoCodigo(e.code);
    if (n && MOD[n]) { // soltou o modificador sem outra tecla: ele sozinho
      const m = n === 'RCTRL' ? 'LCTRL' : n;
      if (ctl.captura.mods.has(m)) { ctl.captura.mods.delete(m); fimCaptura(ctl.captura.mods.size ? combinado(m) : m); }
    }
  }, true);
  $('#captura').addEventListener('mousedown', e => {
    if (!ctl.captura || e.target.closest('button')) return;
    e.preventDefault();
    const n = BOTAO_MOUSE[e.button];
    if (n) fimCaptura(combinado(n));
  });
  $('#captura').addEventListener('contextmenu', e => e.preventDefault());
}

// ------------------------------------------------------------------ Avançado
const FLAGS = [
  { k: 'console', nome: 'Janela de console', texto: 'A janela preta com as mensagens do vitart, aberta junto com o jogo. Desligada, o jogo abre sozinho.' },
  { k: 'log', nome: 'Registro', texto: 'Grava as mensagens em logs/vitart.log, o arquivo que ajuda a investigar um problema.', pasta: 'log_pasta' },
  { k: 'texdump', nome: 'Dump de texturas', texto: 'Grava cada textura original do jogo, na primeira vez que ela aparece, como PNG na pasta texdump. Deixa o jogo um pouco mais lento enquanto grava.', pasta: 'texdump_pasta' },
];
function montarAvan(sec) {
  const f = st.opcoes?.flags || {};
  sec.append(el('div', { class: 'flags' }, ...FLAGS.map(o => el('div', { class: 'flag painel' },
    el('div', { class: 'flag-corpo' },
      el('div', { class: 'flag-nome' }, o.nome),
      el('div', { class: 'flag-texto mudo' }, o.texto),
      o.pasta && st.opcoes ? el('button', { class: 'btn fino', html: icone('pasta') + '<span>Abrir pasta</span>', onclick: () => abrirPasta(st.opcoes[o.pasta]) }) : null),
    el('label', { class: 'chave-liga', 'aria-label': o.nome },
      el('input', { type: 'checkbox', checked: f[o.k] ? true : null, onchange: e => salvarFlag(o.k, e.target.checked) }), el('span'))))));
}
async function salvarFlag(k, v) {
  try {
    st.opcoes.flags = await vt.rpc('salvar_opcao', { chave: k, valor: v ? 1 : 0 });
    avisar('Salvo', 'Vale na próxima vez que o jogo abrir.');
  } catch (e) { avisar('Não deu', e.message, 'erro'); }
}
async function abrirPasta(p) {
  try { await vt.rpc('criar_pasta', { pasta: p }); } catch (_) { /* abre mesmo assim */ }
  vt.abrirLink(await vt.urlDe(p));
}

const MONTAR = { video: montarVideo, ctl: montarCtl, avan: montarAvan };

// ------------------------------------------------------------------ início
vt.aoEvento(m => {
  if (m.ev === 'caiu') {
    $('#estado-ponte').classList.add('caiu');
    $('#estado-ponte').lastChild.textContent = 'Python fechou';
    avisar('Python', 'A ponte com as ferramentas fechou. Confira se o Python está instalado.', 'erro');
  }
});

(async function iniciar() {
  montarBarra('Settings');
  montarNav();
  await carregarArte();
  try { st.opcoes = await vt.rpc('opcoes'); } catch (e) { avisar('Opções', e.message, 'erro'); }
  abrir('video');
  const c = $('#carregando');
  const a = animar(c, [{ opacity: 1 }, { opacity: 0 }], 450, 'ease', { fill: 'forwards' });
  a ? (a.onfinish = () => c.remove()) : c.remove();
  cascata($$('#nav button'), [{ opacity: 0, transform: 'translateX(-12px)' }, { opacity: 1, transform: 'none' }], 50, 380);
  // a lista de processos muda: confere de novo se o jogo abriu ou fechou
  setInterval(async () => {
    try {
      const o = await vt.rpc('opcoes');
      if (st.opcoes && o.jogo_aberto !== st.opcoes.jogo_aberto) { st.opcoes = { ...o, api: st.opcoes.api }; pintarApis(); }
    } catch (_) { /* a ponte avisa sozinha se cair */ }
  }, 5000);
})();
