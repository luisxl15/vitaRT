// Instalador em forma de menu do jogo: setas (ou o direcional do controle) escolhem, Enter/✕ confirma, Esc/○ volta,
// ◄ ► mudam as opções. O mouse também serve: passar por cima escolhe, clicar confirma.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const QUIETO = matchMedia('(prefers-reduced-motion: reduce)').matches;
const animar = (el, q, d, extra = {}) => (QUIETO || !el ? null : el.animate(q, { duration: d, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards', ...extra }));
// nos testes (VITART_UI_JS) os arquivos vêm de window.__testeArquivos, sem diálogo
const escolher = tipo => (window.__testeArquivos && window.__testeArquivos[tipo]) || inst.escolher(tipo);
const gb = b => (b / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + ' GB';

const st = { pag: null, sel: {}, pkgOk: false, rifOk: false, chaveOk: false, destino: '', espacoOk: false, ocupado: false,
  op: { desktop: true, menu: true, registro: true }, pergunta: null };

const escrever = (el, t) => Fonte.escrever(el, t);

// ------------------------------------------------------------------ menu
const itens = () => (st.pergunta ? $$('#pergunta .item') : $$(`.pag[data-p="${st.pag}"] .item`));
function selecionar(i, som = true) {
  const lista = itens();
  if (!lista.length) return;
  i = (i + lista.length) % lista.length;
  const chave = st.pergunta ? 'perg' : st.pag;
  st.sel[chave] = i;
  lista.forEach((e, k) => e.classList.toggle('sel', k === i));
  if (som) animar(lista[i], [{ transform: 'translateX(-4px)' }, { transform: 'none' }], 160);
  dicas();
}
const atual = () => itens()[st.sel[st.pergunta ? 'perg' : st.pag] || 0];

function ativar(el = atual()) {
  if (!el || el.classList.contains('off') || st.ocupado) return;
  if (st.pergunta && el.dataset.resp !== undefined) return responder(el.dataset.resp === '1');
  if (el.dataset.op) return mudarOp(el.dataset.op);
  animar(el, [{ transform: 'scale(1.06)', filter: 'brightness(1.6)' }, { transform: 'none', filter: 'none' }], 260);
  ACOES[el.dataset.acao]?.();
}
function voltar() {
  if (st.pergunta) return responder(false);
  if (st.pag === 1) irPara(0);
  else if (st.pag === 2) irPara(1);
  else if (st.pag === 3) ACOES.cancelar();
}

function irPara(p) {
  const velha = $(`.pag[data-p="${st.pag}"]`);
  if (velha) velha.classList.remove('ativa');
  st.pag = p;
  const nova = $(`.pag[data-p="${p}"]`);
  nova.classList.add('ativa');
  animar(nova, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], 420);
  $$('.tit, .menu > .item, .tabua > *', nova).forEach((e, k) => animar(e, [{ opacity: 0, transform: 'translateX(-10px)' }, { opacity: 1, transform: 'none' }], 360, { delay: 40 * Math.min(k, 8) }));
  selecionar(st.sel[p] || 0, false);
}

// rodapé com as teclas, como as dicas de botão do jogo
function dicas() {
  const d = [['Enter', 'Selecionar']];
  if (atual()?.dataset.op) d.unshift(['◄ ►', 'Mudar']);
  if (st.pergunta || st.pag === 1 || st.pag === 2) d.push(['Esc', 'Voltar']);
  $('#dicas').replaceChildren(...d.map(([t, r]) => {
    const e = document.createElement('div');
    e.className = 'dica';
    const k = document.createElement('span');
    k.className = 'tecla';
    k.textContent = t;
    e.append(k, Fonte.texto(r, 13));
    return e;
  }));
}

// ------------------------------------------------------------------ pergunta (sim/não)
function perguntar(txt) {
  return new Promise(ok => {
    st.pergunta = ok;
    escrever($('#perg-txt'), txt);
    $('#pergunta').hidden = false;
    animar($('#pergunta .tabua'), [{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }], 260);
    st.sel.perg = 1; // começa no "Não"
    selecionar(1, false);
  });
}
function responder(sim) {
  const ok = st.pergunta;
  st.pergunta = null;
  $('#pergunta').hidden = true;
  dicas();
  ok?.(sim);
}

// ------------------------------------------------------------------ licença
function valor(id, txt, cls = '') {
  const el = $('#' + id);
  el.className = 'val ' + cls;
  escrever(el, txt);
}
function avisoLic(txt, bom = false) {
  const a = $('#aviso-lic');
  a.textContent = txt || '';
  a.classList.toggle('bom', bom);
}
function liberarContinuar() { $('#i-continuar').classList.toggle('off', !st.chaveOk); }

async function escolherPkg() {
  const p = await escolher('pkg');
  if (!p) return;
  st.pkgOk = st.chaveOk = false; liberarContinuar();
  $('#a-pkg').textContent = p;
  $('#b-pkg').hidden = false;
  $('#b-pkg div').style.transform = 'scaleX(0)';
  valor('v-pkg', 'Conferindo');
  avisoLic('');
  const r = await inst.pkg(p);
  $('#b-pkg').hidden = true;
  if (r.ok) { st.pkgOk = true; valor('v-pkg', 'Conferido', 'ok'); }
  else { valor('v-pkg', 'Recusado', 'ruim'); avisoLic(r.erro); }
  await tentarChave();
}
let ultimoPct = -1;
inst.aoPkg(f => {
  $('#b-pkg div').style.transform = `scaleX(${f})`;
  const pct = Math.floor(100 * f);
  if (pct !== ultimoPct) { ultimoPct = pct; valor('v-pkg', 'Conferindo ' + pct); }
});

async function escolherRif() {
  const p = await escolher('rif');
  if (!p) return;
  st.rifOk = st.chaveOk = false; liberarContinuar();
  $('#a-rif').textContent = p;
  const r = await inst.licenca(p);
  if (r.ok) { st.rifOk = true; valor('v-rif', 'Aceito', 'ok'); avisoLic(''); }
  else { valor('v-rif', 'Recusado', 'ruim'); avisoLic(r.erro); }
  await tentarChave();
}

async function tentarChave() {
  if (!(st.pkgOk && st.rifOk)) return liberarContinuar();
  const r = await inst.chave();
  st.chaveOk = r.ok;
  avisoLic(r.ok ? `Tudo certo: ${r.arquivos.toLocaleString('pt-BR')} arquivos, ${gb(r.total)}.` : r.erro, r.ok);
  liberarContinuar();
  if (r.ok) selecionar(itens().indexOf($('#i-continuar')));
}

// ------------------------------------------------------------------ destino
function pintarOps() {
  $$('.op').forEach(el => {
    const v = el.querySelector('.val');
    const e = document.createElement('i'); e.className = 'seta e';
    const d = document.createElement('i'); d.className = 'seta d';
    v.replaceChildren(e, Fonte.texto(st.op[el.dataset.op] ? 'Sim' : 'Não', 15), d);
  });
}
function mudarOp(k) {
  st.op[k] = !st.op[k];
  pintarOps();
  animar($(`.op[data-op="${k}"] .val .gw`), [{ transform: 'translateY(-4px)', opacity: 0 }, { transform: 'none', opacity: 1 }], 200);
}
async function atualizarEspaco() {
  $('#a-pasta').textContent = st.destino;
  const r = await inst.espaco(st.destino);
  const a = $('#aviso-esp');
  if (r.erro) { st.espacoOk = false; a.textContent = 'Pasta inválida: ' + r.erro; a.classList.remove('bom'); }
  else {
    st.espacoOk = r.livre >= r.precisa * 1.02;
    a.textContent = st.espacoOk ? `O jogo ocupa ${gb(r.precisa)}. Livre em ${r.raiz}: ${gb(r.livre)}.`
      : `Falta espaço em ${r.raiz}: o jogo precisa de ${gb(r.precisa)} e há ${gb(r.livre)} livres.`;
    a.classList.toggle('bom', st.espacoOk);
  }
  $('#i-instalar').classList.toggle('off', !st.espacoOk);
}

// ------------------------------------------------------------------ instalação
let medida = { t: 0, f: 0, vel: 0 }, ultimoNum = -1;
inst.aoInstalar(({ feito, total, arq, seg }) => {
  const k = feito / total, n = Math.floor(100 * k);
  $('#i-vida').style.transform = `scaleX(${k})`;
  if (n !== ultimoNum) { ultimoNum = n; escrever($('#i-num'), String(n)); }
  $('#i-arq').textContent = arq;
  if (seg - medida.t > 1) { const v = (feito - medida.f) / (seg - medida.t); medida = { t: seg, f: feito, vel: medida.vel ? medida.vel * .7 + v * .3 : v }; }
  const partes = [`${gb(feito)} de ${gb(total)}`];
  if (medida.vel) {
    partes.push(`${Math.round(medida.vel / 1e6)} MB/s`);
    const r = (total - feito) / medida.vel;
    partes.push(r > 90 ? `faltam ${Math.ceil(r / 60)} min` : `faltam ${Math.ceil(r)} s`);
  }
  escrever($('#i-stats'), partes.join('   -   '));
});

const ACOES = {
  comecar: () => irPara(1),
  fechar: () => inst.janela('fechar'),
  voltar,
  pkg: escolherPkg,
  rif: escolherRif,
  'lic-ok': () => { if (st.chaveOk) { irPara(2); atualizarEspaco(); } },
  pasta: async () => {
    const p = await escolher('pasta');
    if (!p) return;
    st.destino = /god of war collection$/i.test(p) ? p : p.replace(/[\\/]$/, '') + '\\God of War Collection';
    atualizarEspaco();
  },
  instalar: async () => {
    if (!st.espacoOk) return;
    escrever($('#i-num'), '0');
    irPara(3);
    const r = await inst.instalar(st.destino, st.op);
    if (r.ok) {
      $('#pronto-txt').textContent = `O jogo está em ${st.destino}.` + (st.op.desktop ? ' Há um atalho na Área de Trabalho.' : '') +
        ' Para remover, use Programas e Recursos ou o Desinstalar.cmd da pasta.';
      irPara(4);
    } else {
      irPara(2);
      const a = $('#aviso-esp');
      a.classList.remove('bom');
      a.textContent = r.cancelado ? 'Instalação cancelada. A pasta ficou incompleta: instale de novo para terminar.' : 'A instalação falhou: ' + r.erro;
    }
  },
  cancelar: async () => { if (await perguntar('Cancelar a instalação?')) inst.cancelar(); },
  jogar: () => inst.jogar(),
  'pasta-abrir': () => inst.abrirPasta(),
};

// ------------------------------------------------------------------ entrada: teclado, mouse e controle
document.addEventListener('keydown', e => {
  const k = e.key;
  if (k === 'ArrowDown' || (k === 'ArrowRight' && !atual()?.dataset.op && isLinha())) { e.preventDefault(); selecionar((st.sel[st.pergunta ? 'perg' : st.pag] || 0) + 1); }
  else if (k === 'ArrowUp' || (k === 'ArrowLeft' && !atual()?.dataset.op && isLinha())) { e.preventDefault(); selecionar((st.sel[st.pergunta ? 'perg' : st.pag] || 0) - 1); }
  else if ((k === 'ArrowLeft' || k === 'ArrowRight') && atual()?.dataset.op) { e.preventDefault(); mudarOp(atual().dataset.op); }
  else if (k === 'Enter' || k === ' ') { e.preventDefault(); ativar(); }
  else if (k === 'Escape') { e.preventDefault(); voltar(); }
});
// nos menus deitados (botões de baixo, sim/não) esquerda/direita também andam
const isLinha = () => { const el = atual(); return !!el && (el.parentElement.classList.contains('baixo') || el.parentElement.classList.contains('linha-menu')); };
document.addEventListener('mouseover', e => {
  const el = e.target.closest('.item');
  if (el) { const i = itens().indexOf(el); if (i >= 0 && i !== (st.sel[st.pergunta ? 'perg' : st.pag] || 0)) selecionar(i); }
});
document.addEventListener('click', e => {
  const el = e.target.closest('.item');
  if (el && itens().includes(el)) ativar(el);
  const j = e.target.closest('[data-j]');
  if (j) inst.janela(j.dataset.j);
});
// controle (Xbox/PlayStation pela Gamepad API): direcional/analógico, ✕/A confirma, ○/B volta
(function controle() {
  const antes = {};
  let repete = 0;
  function laco(t) {
    const g = [...(navigator.getGamepads?.() || [])].find(Boolean);
    if (g) {
      const b = i => g.buttons[i]?.pressed;
      const cima = b(12) || g.axes[1] < -.6, baixo = b(13) || g.axes[1] > .6, esq = b(14) || g.axes[0] < -.6, dir = b(15) || g.axes[0] > .6;
      const borda = (nome, v) => { const r = v && !antes[nome]; antes[nome] = v; return r; };
      const seg = (cima || baixo) && t > repete;
      if (borda('c', cima) || (cima && seg)) { selecionar((st.sel[st.pergunta ? 'perg' : st.pag] || 0) - 1); repete = t + 220; }
      if (borda('b', baixo) || (baixo && seg)) { selecionar((st.sel[st.pergunta ? 'perg' : st.pag] || 0) + 1); repete = t + 220; }
      if (borda('e', esq) || borda('d', dir)) { if (atual()?.dataset.op) mudarOp(atual().dataset.op); else if (isLinha()) selecionar((st.sel[st.pergunta ? 'perg' : st.pag] || 0) + (dir ? 1 : -1)); }
      if (borda('a', b(0))) ativar();
      if (borda('x', b(1))) voltar();
    }
    requestAnimationFrame(laco);
  }
  requestAnimationFrame(laco);
})();

// ------------------------------------------------------------------ início
(async () => {
  await Fonte.pronta;
  $$('[data-t]').forEach(el => escrever(el, el.dataset.t));
  valor('v-pkg', 'Falta');
  valor('v-rif', 'Falta');
  pintarOps();
  liberarContinuar();
  const r = await inst.info();
  if (!r.ok) { $('#erro-txt').textContent = `${r.erro} Procurei em: ${r.dados}`; irPara('erro'); return; }
  st.destino = r.padrao;
  irPara(0);
  animar($('.logo'), [{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }], 1100);
})();
