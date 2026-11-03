// vitart Settings: a API de vídeo do jogo (renderer= no vitart_options.ini) e o mapa completo de teclado e mouse.
// O mapa espelha o código: games/gow/gow_profile.cpp (game_keyboard_buttons), runtime/vitart/hle_sys.cpp (WASD e
// Shift) e runtime/vitart/gxm_window.cpp (F9, F11, Alt+Enter). Mudou lá, muda aqui.
const NAV_ICO = {
  video: '<rect x="1.5" y="3" width="13" height="8.5"/><path d="M5.5 14h5M8 11.5V14"/>',
  ctl: '<rect x="1.5" y="4.5" width="13" height="7.5" rx="1"/><path d="M4 7h1M6.5 7h1M9 7h1M11.5 7h1M4.5 9.5h7"/>',
};
const SECOES = [
  { id: 'video', nome: 'Gráficos', sobre: 'API de vídeo', titulo: 'Gráficos', arte: 'rocha',
    sub: 'Escolha com que API o jogo desenha. A troca vale na próxima vez que o jogo abrir.' },
  { id: 'ctl', nome: 'Controles', sobre: 'Teclado e mouse', titulo: 'Mapa de teclas', arte: 'chave',
    sub: 'O esquema do God of War (2018) de PC levado aos botões dos jogos do Vita.' },
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
    el('div', { class: 'nota oculto', id: 'aviso-jogo' }, 'O jogo está aberto. Feche e abra de novo para trocar a API; se mudar alguma opção no menu de pausa antes de fechar, ele grava a API antiga por cima.'),
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
// Cada linha: grupo, teclas (alternativas; "+" junta teclas apertadas juntas), botão do Vita e ação. gow1/gow2:
// o que muda entre os dois jogos; só: a linha vale só naquele jogo.
const GRUPOS = { mov: 'Movimento', luta: 'Combate', acao: 'Interação', menu: 'Menus', janela: 'Janela (vitart)' };
const MAPA = [
  { g: 'mov', t: ['W A S D'], b: 'Analógico esquerdo', a: 'Andar' },
  { g: 'mov', t: ['Shift+W A S D'], b: 'Analógico direito', a: 'Esquivar / rolar' },
  { g: 'mov', t: ['Space'], b: '✕ Cruz', a: 'Pular', gow2: 'Pular; segurado no ar, plana com as asas de Ícaro' },
  { g: 'luta', t: ['LMB'], b: '□ Quadrado', a: 'Ataque leve' },
  { g: 'luta', t: ['RMB'], b: '△ Triângulo', a: 'Ataque pesado' },
  { g: 'luta', t: ['MMB', 'F'], b: '○ Círculo', a: 'Agarrar (e os QTEs de círculo)' },
  { g: 'luta', t: ['Shift+MMB', 'V'], b: 'L3 + R3', a: 'Rage of the Gods', gow2: 'Rage of the Titans' },
  { g: 'luta', t: ['Q'], b: 'L1', a: 'Defender / aparar', gow2: 'Defender; com o Golden Fleece, refletir' },
  { g: 'luta', t: ['LCtrl'], b: 'L2', a: 'Magia', gow2: 'Item' },
  { g: 'acao', t: ['E'], b: 'R2', b2: 'R1', a: 'Interagir (baús, portas, alavancas)' },
  { g: 'acao', t: ['R'], b: 'R1', b2: 'R2', a: 'O outro botão R' },
  { g: 'acao', t: ['C'], b: 'L1 + R1', a: 'Amuleto das Moiras (congela o tempo)', so: 2 },
  { g: 'menu', t: ['1', 'Up'], b: 'Direcional ↑', a: 'Magia do direcional para cima; navegar nos menus' },
  { g: 'menu', t: ['2', 'Right'], b: 'Direcional →', a: 'Magia do direcional para a direita; navegar nos menus' },
  { g: 'menu', t: ['3', 'Down'], b: 'Direcional ↓', a: 'Magia do direcional para baixo; navegar nos menus' },
  { g: 'menu', t: ['4', 'Left'], b: 'Direcional ←', a: 'Magia do direcional para a esquerda; navegar nos menus' },
  { g: 'menu', t: ['Esc', 'Backspace'], b: 'SELECT', a: 'Pausa' },
  { g: 'menu', t: ['I', 'K', 'Tab', 'Enter'], b: 'START', a: 'Power Up (melhorar armas e magias)' },
  { g: 'janela', t: ['F11', 'Alt+Enter'], b: '', a: 'Tela cheia / janela' },
  { g: 'janela', t: ['F9'], b: '', a: 'Capturar o quadro seguinte (diagnóstico, vai para a pasta capturas)' },
];
const NOME_TECLA = { Space: 'Espaço', LMB: 'Botão esquerdo', RMB: 'Botão direito', MMB: 'Botão do meio', LCtrl: 'Ctrl esquerdo',
  Up: '↑', Down: '↓', Left: '←', Right: '→', Backspace: 'Backspace', Enter: 'Enter', Esc: 'Esc', Tab: 'Tab', Shift: 'Shift', Alt: 'Alt' };

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

function linhasDoJogo() {
  return MAPA.filter(l => !l.so || l.so === st.jogo).map(l => ({
    ...l,
    botao: st.jogo === 2 && l.b2 ? l.b2 : l.b,
    acao: st.jogo === 2 && l.gow2 ? l.gow2 : l.a,
    teclas: [...new Set(l.t.flatMap(x => x.split('+').flatMap(p => p.split(' '))))],
  }));
}

function montarCtl(sec) {
  sec.append(
    el('div', { class: 'barra-acoes' },
      el('div', { class: 'jogos', role: 'tablist', 'aria-label': 'Jogo' },
        ...[[1, 'God of War'], [2, 'God of War II']].map(([g, n]) =>
          el('button', { role: 'tab', 'data-g': g, 'data-no-i18n': '', onclick: () => { st.jogo = g; pintarCtl(); } }, n))),
      el('div', { class: 'direita mudo legenda' }, 'Passe o mouse numa tecla ou numa linha para ver as duas juntas.')),
    el('div', { class: 'ctl-topo' },
      el('div', { class: 'teclado painel', id: 'teclado' }),
      el('div', { class: 'mouse painel' }, el('div', { class: 'mouse-corpo', id: 'mouse' }), el('div', { class: 'caixa' }, 'Mouse'))),
    el('div', { class: 'mapa', id: 'mapa' }),
    el('div', { class: 'nota' }, 'O teclado só vale com a janela do jogo em foco. Controles (Xbox, DualShock 4, DualSense) funcionam ao mesmo tempo, e os ícones dos botões seguem o último que você usou. Espaço (✕) também pula as cenas em vídeo.'));
  montarTeclado();
  pintarCtl();
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

function capa(id) {
  return el('kbd', {}, NOME_TECLA[id] ? tr(NOME_TECLA[id]) : id);
}
function pintarCtl() {
  $$('.jogos button').forEach(b => b.setAttribute('aria-selected', String(+b.dataset.g === st.jogo)));
  const linhas = linhasDoJogo();
  const usadas = new Map(); // tecla -> grupo
  linhas.forEach(l => l.teclas.forEach(k => usadas.has(k) || usadas.set(k, l.g)));
  $$('.tecla').forEach(t => { t.dataset.g = usadas.get(t.dataset.k) || ''; t.classList.toggle('usada', usadas.has(t.dataset.k)); });
  $('#mapa').replaceChildren(...Object.entries(GRUPOS).map(([g, nome]) => {
    const ls = linhas.filter(l => l.g === g);
    return el('div', { class: 'grupo', 'data-g': g },
      el('h3', { class: 'caixa' }, nome),
      ...ls.map(l => {
        const r = el('div', { class: 'linha' },
          el('div', { class: 'teclas' }, ...l.t.flatMap((alt, j) => [
            j ? el('span', { class: 'ou' }, 'ou') : null,
            ...alt.split('+').flatMap((parte, k) => [k ? el('span', { class: 'mais' }, '+') : null, ...parte.split(' ').map(capa)]),
          ])),
          el('div', { class: 'botao' }, l.botao || '—'),
          el('div', { class: 'acao' }, l.acao));
        r.addEventListener('mouseenter', () => destacar(null, l.teclas));
        r.addEventListener('mouseleave', () => destacar(null, null));
        r.dataset.teclas = l.teclas.join(' ');
        return r;
      }));
  }));
  cascata($$('#mapa .linha'), [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], 14, 300);
}

// tecla -> linhas que a usam; linha -> as teclas dela
function destacar(k, teclas) {
  const on = new Set(teclas || (k ? [k] : []));
  $$('.tecla').forEach(t => t.classList.toggle('acesa', on.has(t.dataset.k)));
  $$('#mapa .linha').forEach(r => r.classList.toggle('acesa', !!k && r.dataset.teclas.split(' ').includes(k)));
}

const MONTAR = { video: montarVideo, ctl: montarCtl };

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
