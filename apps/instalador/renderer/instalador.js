// Instalador em forma de menu do jogo: setas (ou o direcional do controle) escolhem, Enter/✕ confirma, Esc/○ volta,
// ◄ ► mudam as opções. O mouse também serve: passar por cima escolhe, clicar confirma. Textos em textos.js.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const QUIETO = matchMedia('(prefers-reduced-motion: reduce)').matches;
const animar = (el, q, d, extra = {}) => (QUIETO || !el ? null : el.animate(q, { duration: d, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards', ...extra }));
// nos testes (VITART_UI_JS) os arquivos vêm de window.__testeArquivos, sem diálogo
const escolher = tipo => (window.__testeArquivos && window.__testeArquivos[tipo]) || inst.escolher(tipo);
const gb = b => (b / 1e9).toLocaleString(IDIOMA === 'pt' ? 'pt-BR' : IDIOMA, { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + ' GB';
const erroTxt = r => t('e.' + (r.codigo || 'generico'), { ...r.dados, erro: r.erro, tem: numero(r.dados?.tem || 0), certo: numero(r.dados?.certo || 0) });

const st = { pag: null, sel: {}, pkgOk: false, rifOk: false, chaveOk: false, destino: '', espacoOk: false,
  op: { desktop: true, menu: true, registro: true }, pergunta: null, val: {}, arq: {} };

const escrever = (el, txt) => Fonte.escrever(el, txt);

// ------------------------------------------------------------------ textos na tela (de novo a cada troca de idioma)
function pintarTextos() {
  document.documentElement.lang = IDIOMA === 'pt' ? 'pt-BR' : IDIOMA;
  $$('[data-k]').forEach(el => escrever(el, t(el.dataset.k)));
  $$('[data-kp]').forEach(el => { if (!st.arq[el.id]) el.textContent = t(el.dataset.kp); });
  for (const [id, v] of Object.entries(st.val)) valor(id, v.k, v.cls, v.extra);
  pintarOps();
  dicas();
  inst.frasesSair({ msg: t('sair.msg'), det: t('sair.det'), ficar: t('sair.ficar'), sair: t('sair.sair') });
}

// ------------------------------------------------------------------ menu
const chaveSel = () => (st.pergunta ? 'perg' : st.pag);
const itens = () => (st.pergunta ? $$('#pergunta .item') : $$(`.pag[data-p="${st.pag}"] .item`));
function selecionar(i, mexe = true) {
  const lista = itens();
  if (!lista.length) return;
  i = (i + lista.length) % lista.length;
  st.sel[chaveSel()] = i;
  lista.forEach((e, k) => e.classList.toggle('sel', k === i));
  if (mexe) animar(lista[i], [{ transform: 'translateX(-4px)' }, { transform: 'none' }], 160);
  dicas();
}
const atual = () => itens()[st.sel[chaveSel()] || 0];
const andar = d => selecionar((st.sel[chaveSel()] || 0) + d);

function ativar(el = atual()) {
  if (!el || el.classList.contains('off')) return;
  if (st.pergunta && el.dataset.resp !== undefined) return responder(el.dataset.resp === '1');
  if (el.dataset.op) return mudarOp(el.dataset.op, 1);
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
  const d = [['Enter', t('dica.sel')]];
  if (atual()?.dataset.op) d.unshift(['◄ ►', t('dica.mudar')]);
  if (st.pergunta || st.pag === 1 || st.pag === 2) d.push(['Esc', t('dica.voltar')]);
  $('#dicas').replaceChildren(...d.map(([k, r]) => {
    const e = document.createElement('div');
    e.className = 'dica';
    const c = document.createElement('span');
    c.className = 'tecla';
    c.textContent = k;
    e.append(c, Fonte.texto(r, 13));
    return e;
  }));
}

// ------------------------------------------------------------------ pergunta (sim/não)
function perguntar(k) {
  return new Promise(ok => {
    st.pergunta = ok;
    escrever($('#perg-txt'), t(k));
    $('#pergunta').hidden = false;
    animar($('#pergunta .tabua'), [{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }], 260);
    selecionar(1, false); // começa no "Não"
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
function valor(id, k, cls = '', extra = '') {
  st.val[id] = { k, cls, extra };
  const el = $('#' + id);
  el.className = 'val ' + cls;
  escrever(el, t(k) + extra);
}
function aviso(id, txt, bom = false) {
  const a = $('#' + id);
  a.textContent = txt || '';
  a.classList.toggle('bom', bom);
}
function liberarContinuar() { $('#i-continuar').classList.toggle('off', !st.chaveOk); }
function mostrarArquivo(id, p) { st.arq[id] = p; $('#' + id).textContent = p; }

async function escolherPkg() {
  const p = await escolher('pkg');
  if (!p) return;
  st.pkgOk = st.chaveOk = false; liberarContinuar();
  mostrarArquivo('a-pkg', p);
  $('#b-pkg').hidden = false;
  $('#b-pkg div').style.transform = 'scaleX(0)';
  valor('v-pkg', 'val.conferindo');
  aviso('aviso-lic', '');
  const r = await inst.pkg(p);
  $('#b-pkg').hidden = true;
  if (r.ok) { st.pkgOk = true; valor('v-pkg', 'val.conferido', 'ok'); }
  else { valor('v-pkg', 'val.recusado', 'ruim'); aviso('aviso-lic', erroTxt(r)); }
  await tentarChave();
}
let ultimoPct = -1;
inst.aoPkg(f => {
  $('#b-pkg div').style.transform = `scaleX(${f})`;
  const pct = Math.floor(100 * f);
  if (pct !== ultimoPct) { ultimoPct = pct; valor('v-pkg', 'val.conferindo', '', ' ' + pct + '%'); }
});

async function escolherRif() {
  const p = await escolher('rif');
  if (!p) return;
  st.rifOk = st.chaveOk = false; liberarContinuar();
  mostrarArquivo('a-rif', p);
  const r = await inst.licenca(p);
  if (r.ok) { st.rifOk = true; valor('v-rif', 'val.aceito', 'ok'); aviso('aviso-lic', ''); }
  else { valor('v-rif', 'val.recusado', 'ruim'); aviso('aviso-lic', erroTxt(r)); }
  await tentarChave();
}

async function tentarChave() {
  if (!(st.pkgOk && st.rifOk)) return liberarContinuar();
  const r = await inst.chave();
  st.chaveOk = r.ok;
  aviso('aviso-lic', r.ok ? t('lic.ok', { n: numero(r.arquivos), gb: gb(r.total) }) : erroTxt(r), r.ok);
  liberarContinuar();
  if (r.ok) selecionar(itens().indexOf($('#i-continuar')));
}

// ------------------------------------------------------------------ opções (◄ valor ►)
function pintarOps() {
  $$('[data-op]').forEach(el => {
    const v = el.querySelector('.val');
    const txt = el.dataset.op === 'idioma' ? TEXTOS[IDIOMA].nome : t(st.op[el.dataset.op] ? 'op.sim' : 'op.nao');
    const e = document.createElement('i'); e.className = 'seta e';
    const d = document.createElement('i'); d.className = 'seta d';
    v.replaceChildren(e, Fonte.texto(txt, el.dataset.op === 'idioma' ? 20 : 15), d);
  });
}
function mudarOp(k, dir) {
  if (k === 'idioma') {
    IDIOMA = IDIOMAS[(IDIOMAS.indexOf(IDIOMA) + dir + IDIOMAS.length) % IDIOMAS.length];
    try { localStorage.setItem('idioma', IDIOMA); } catch (_) { /* sem armazenamento */ }
    pintarTextos();
    selecionar(st.sel[chaveSel()] || 0, false);
  } else {
    st.op[k] = !st.op[k];
    pintarOps();
  }
  animar($(`[data-op="${k}"] .val .gw`), [{ transform: `translateX(${dir > 0 ? -8 : 8}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], 200);
}

// ------------------------------------------------------------------ destino
async function atualizarEspaco() {
  $('#a-pasta').textContent = st.destino;
  const r = await inst.espaco(st.destino);
  if (r.erro) { st.espacoOk = false; aviso('aviso-esp', t('dest.invalida', { e: r.erro })); }
  else {
    st.espacoOk = r.livre >= r.precisa * 1.02;
    aviso('aviso-esp', t(st.espacoOk ? 'dest.ocupa' : 'dest.falta', { p: gb(r.precisa), r: r.raiz, l: gb(r.livre) }), st.espacoOk);
  }
  $('#i-instalar').classList.toggle('off', !st.espacoOk);
}

// ------------------------------------------------------------------ instalação
let medida = { t: 0, f: 0, vel: 0 }, ultimo = {};
function trocar(id, txt) { if (ultimo[id] !== txt) { ultimo[id] = txt; escrever($('#' + id), txt); } }
function progresso({ feito, total, arq, n, nArq, seg }) {
  const k = total ? feito / total : 0;
  $('#haste').style.setProperty('--p', k.toFixed(4));
  trocar('i-pct', Math.floor(100 * k) + '%');
  trocar('i-gb', t('inst.de', { a: gb(feito), b: gb(total) }));
  trocar('i-arqs', `${numero(n || 0)} / ${numero(nArq || 0)}`);
  $('#i-arq').textContent = arq || ' ';
  if (seg - medida.t > 1) { const v = (feito - medida.f) / (seg - medida.t); medida = { t: seg, f: feito, vel: medida.vel ? medida.vel * .7 + v * .3 : v }; }
  if (medida.vel) {
    trocar('i-vel', `${Math.round(medida.vel / 1e6)} MB/s`);
    const r = (total - feito) / medida.vel;
    trocar('i-resta', r > 90 ? t('inst.min', { n: Math.ceil(r / 60) }) : t('inst.seg', { n: Math.max(0, Math.ceil(r)) }));
  } else { trocar('i-vel', '-'); trocar('i-resta', t('inst.calc')); }
}
inst.aoInstalar(progresso);

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
    medida = { t: 0, f: 0, vel: 0 }; ultimo = {};
    progresso({ feito: 0, total: 1, arq: '', n: 0, nArq: 0, seg: 0 });
    irPara(3);
    const textos = { titulo: t('des.titulo'), remove: t('des.remove'), saves: t('des.saves'), continuar: t('des.continuar'),
      removido: t('des.removido'), sim: t('op.sim'), nao: t('op.nao') };
    const r = await inst.instalar(st.destino, { ...st.op, textos });
    if (r.ok) {
      $('#pronto-txt').textContent = t('pronto.txt', { d: st.destino }) + (st.op.desktop ? t('pronto.atalho') : '') + t('pronto.remover');
      irPara(4);
    } else {
      irPara(2);
      aviso('aviso-esp', r.cancelado ? t('inst.cancelada') : t('inst.falhou', { e: erroTxt(r) }));
    }
  },
  cancelar: async () => { if (await perguntar('inst.perg')) inst.cancelar(); },
  jogar: () => inst.jogar(),
  'pasta-abrir': () => inst.abrirPasta(),
};

// ------------------------------------------------------------------ entrada: teclado, mouse e controle
// nos menus deitados (botões de baixo, sim/não) esquerda/direita também andam
const deitado = () => { const el = atual(); return !!el && (el.parentElement.classList.contains('baixo') || el.parentElement.classList.contains('linha-menu')); };
function lado(dir) {
  const el = atual();
  if (el?.dataset.op) mudarOp(el.dataset.op, dir);
  else if (deitado()) andar(dir);
}
document.addEventListener('keydown', e => {
  const k = e.key;
  if (k === 'ArrowDown') { e.preventDefault(); andar(1); }
  else if (k === 'ArrowUp') { e.preventDefault(); andar(-1); }
  else if (k === 'ArrowLeft') { e.preventDefault(); lado(-1); }
  else if (k === 'ArrowRight') { e.preventDefault(); lado(1); }
  else if (k === 'Enter' || k === ' ') { e.preventDefault(); ativar(); }
  else if (k === 'Escape') { e.preventDefault(); voltar(); }
});
document.addEventListener('mouseover', e => {
  const el = e.target.closest('.item');
  if (el) { const i = itens().indexOf(el); if (i >= 0 && i !== (st.sel[chaveSel()] || 0)) selecionar(i); }
});
document.addEventListener('click', e => {
  const el = e.target.closest('.item');
  if (el && itens().includes(el)) {
    if (el.dataset.op) mudarOp(el.dataset.op, e.target.closest('.seta.e') ? -1 : 1);
    else ativar(el);
  }
  const j = e.target.closest('[data-j]');
  if (j) inst.janela(j.dataset.j);
});
// controle (Xbox/PlayStation pela Gamepad API): direcional/analógico, ✕/A confirma, ○/B volta
(function controle() {
  const antes = {};
  let repete = 0;
  function laco(tm) {
    const g = [...(navigator.getGamepads?.() || [])].find(Boolean);
    if (g) {
      const b = i => g.buttons[i]?.pressed;
      const cima = b(12) || g.axes[1] < -.6, baixo = b(13) || g.axes[1] > .6, esq = b(14) || g.axes[0] < -.6, dir = b(15) || g.axes[0] > .6;
      const borda = (nome, v) => { const r = v && !antes[nome]; antes[nome] = v; return r; };
      const seg = (cima || baixo) && tm > repete;
      if (borda('c', cima) || (cima && seg)) { andar(-1); repete = tm + 220; }
      if (borda('b', baixo) || (baixo && seg)) { andar(1); repete = tm + 220; }
      if (borda('e', esq)) lado(-1);
      if (borda('d', dir)) lado(1);
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
  st.val = { 'v-pkg': { k: 'val.falta', cls: '', extra: '' }, 'v-rif': { k: 'val.falta', cls: '', extra: '' } };
  pintarTextos();
  liberarContinuar();
  const r = await inst.info();
  if (!r.ok) { $('#erro-txt').textContent = t('erro.dados', { e: erroTxt(r), d: r.pasta }); irPara('erro'); return; }
  st.destino = r.padrao;
  irPara(0);
  animar($('.logo'), [{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }], 1100);
})();
