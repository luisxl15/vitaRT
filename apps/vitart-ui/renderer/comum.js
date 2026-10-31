// Pedaços que as duas telas usam: barra de título, arte do jogo, avisos, diálogo e animações.
const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];
const QUIETO = matchMedia('(prefers-reduced-motion: reduce)').matches;

function el(tag, attrs = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat()) if (f != null && f !== false) e.append(f.nodeType ? f : document.createTextNode(f));
  return e;
}

// ícones de traço simples (desenhados aqui; nada de emoji)
const ICONES = {
  min: '<path d="M1 6h10"/>',
  max: '<rect x="1.5" y="1.5" width="9" height="9"/>',
  restaurar: '<path d="M3.5 3.5V1.5h7v7h-2"/><rect x="1.5" y="3.5" width="7" height="7"/>',
  fechar: '<path d="M1.5 1.5l9 9M10.5 1.5l-9 9"/>',
  busca: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/>',
  pasta: '<path d="M2 4.5h4l1.5 1.5H14v6.5H2z"/>',
  subir: '<path d="M8 13V3M4 7l4-4 4 4"/>',
  descer: '<path d="M8 3v10M4 9l4 4 4-4"/>',
  lixo: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5"/>',
  refazer: '<path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5v3h-3"/>',
  arrastar: '<circle cx="6" cy="4" r=".9"/><circle cx="10" cy="4" r=".9"/><circle cx="6" cy="8" r=".9"/><circle cx="10" cy="8" r=".9"/><circle cx="6" cy="12" r=".9"/><circle cx="10" cy="12" r=".9"/>',
  exportar: '<path d="M8 2v8M5 7l3 3 3-3M3 12.5h10"/>',
  importar: '<path d="M8 10V2M5 5l3-3 3 3M3 12.5h10"/>',
  desfazer: '<path d="M3 8a5 5 0 1 0 1.6-3.7M3 2.5v3h3"/>',
  check: '<path d="M3 8.5l3 3 7-7"/>',
};
function icone(nome, cls = '') {
  return `<svg class="${cls}" viewBox="0 0 ${nome in { min: 1, max: 1, restaurar: 1, fechar: 1 } ? 12 : 16} ${nome in { min: 1, max: 1, restaurar: 1, fechar: 1 } ? 12 : 16}" aria-hidden="true">${ICONES[nome]}</svg>`;
}

function montarBarra(nome) {
  const barra = el('header', { class: 'barra' },
    el('div', { class: 'marca' }, el('img', { id: 'marca-icone', alt: '' }), el('span', { html: `vitart <b>${nome}</b>` })),
    seletorIdioma(),
    el('div', { class: 'ctl' },
      el('button', { 'aria-label': 'Minimizar', html: icone('min'), onclick: () => vt.janela('min') }),
      el('button', { 'aria-label': 'Maximizar', id: 'btn-max', html: icone('max'), onclick: () => vt.janela('max') }),
      el('button', { class: 'fechar', 'aria-label': 'Fechar', html: icone('fechar'), onclick: () => vt.janela('fechar') })));
  document.body.prepend(barra);
  vt.aoMaximizar(m => { $('#btn-max').innerHTML = icone(m ? 'restaurar' : 'max'); });
  barra.addEventListener('dblclick', e => { if (!e.target.closest('.ctl')) vt.janela('max'); });
}

// a arte vem do jogo (tools/vitart_arte.py); vira variáveis CSS --arte-<nome>
const ARTE = {};
async function carregarArte() {
  let arquivos = {};
  try { arquivos = await vt.rpc('arte'); } catch (e) { console.warn('arte:', e); }
  for (const [nome, p] of Object.entries(arquivos)) {
    ARTE[nome] = await vt.urlDe(p);
    document.documentElement.style.setProperty('--arte-' + nome, `url("${ARTE[nome]}")`);
  }
  if (ARTE.icone) $('#marca-icone').src = ARTE.icone;
  return ARTE;
}

// ------------------------------------------------------------------ avisos e diálogo
function avisar(titulo, texto, tipo = '') {
  let box = $('.avisos');
  if (!box) document.body.append(box = el('div', { class: 'avisos', role: 'status', 'aria-live': 'polite' }));
  const a = el('div', { class: 'aviso ' + tipo }, el('b', {}, titulo), texto);
  box.append(a);
  animar(a, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], 320);
  setTimeout(() => {
    const s = animar(a, [{ opacity: 1 }, { opacity: 0, transform: 'translateX(24px)' }], 220, 'ease-in');
    s ? (s.onfinish = () => a.remove()) : a.remove();
  }, tipo === 'erro' ? 7000 : 4200);
}

function confirmar(titulo, texto, rotuloSim = 'Confirmar', perigo = false) {
  return new Promise(ok => {
    const fim = v => { veu.remove(); ok(v); };
    const sim = el('button', { class: 'btn ' + (perigo ? 'forte' : ''), onclick: () => fim(true) }, rotuloSim);
    const veu = el('div', { class: 'veu', onclick: e => e.target === veu && fim(false) },
      el('div', { class: 'dialogo', role: 'dialog', 'aria-modal': 'true' },
        el('h3', {}, titulo), el('p', {}, texto),
        el('div', { class: 'acoes' }, el('button', { class: 'btn', onclick: () => fim(false) }, 'Cancelar'), sim)));
    veu.addEventListener('keydown', e => e.key === 'Escape' && fim(false));
    document.body.append(veu);
    animar(veu, [{ opacity: 0 }, { opacity: 1 }], 160);
    animar(veu.firstChild, [{ opacity: 0, transform: 'translateY(10px) scale(.98)' }, { opacity: 1, transform: 'none' }], 260);
    sim.focus();
  });
}

// ------------------------------------------------------------------ animação (Web Animations API)
function animar(alvo, quadros, dur = 300, ease = 'cubic-bezier(.2,.8,.2,1)', extra = {}) {
  if (QUIETO || !alvo) return null;
  return alvo.animate(quadros, { duration: dur, easing: ease, fill: 'backwards', ...extra });
}
// entrada em cascata: cada um um pouco depois do anterior, até um teto (lista longa não espera)
function cascata(lista, quadros = [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], passo = 28, dur = 360) {
  lista.forEach((e, i) => animar(e, quadros, dur, undefined, { delay: Math.min(i, 14) * passo }));
}
// número que sobe até o valor
function contar(e, ate, dur = 900, fmt = v => Math.round(v)) {
  const de = parseFloat(e.dataset.v || '0');
  e.dataset.v = ate;
  if (QUIETO || de === ate) { e.textContent = fmt(ate); return; }
  const t0 = performance.now();
  const passo = t => {
    const k = Math.min(1, (t - t0) / dur);
    const s = 1 - Math.pow(1 - k, 3);
    e.textContent = fmt(de + (ate - de) * s);
    if (k < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

function tamanho(b) {
  return b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB';
}
function escapar(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
