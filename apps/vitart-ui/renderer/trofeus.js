// vitart Troféus: progresso dos dois jogos, o que falta e como pegar. Relê o unlocked.txt a cada 2 s, então dá
// para deixar aberto ao lado do jogo e ver o troféu chegar.
const TIPO = { P: 'Platina', G: 'Ouro', S: 'Prata', B: 'Bronze' };
const st = { jogos: [], cur: null, filtro: 'todos', busca: '', sel: null, linhas: [], mtimes: {}, novos: new Set() };

const jogoAtual = () => st.jogos.find(j => j.comm === st.cur);
const tem = (j, id) => j.obtidos.includes(id);

function progresso(j) {
  const total = j.lista.reduce((s, t) => s + t.pontos, 0);
  const feito = j.lista.filter(t => tem(j, t.id)).reduce((s, t) => s + t.pontos, 0);
  return total ? (100 * feito) / total : 0;
}

// ------------------------------------------------------------------ cabeçalho
function pintarJogos() {
  const nav = $('#jogos');
  nav.replaceChildren(...st.jogos.filter(j => j.lista.length).map(j =>
    el('button', { class: 'jogo', 'aria-pressed': String(j.comm === st.cur), onclick: () => trocarJogo(j.comm) },
      j.title, el('small', {}, Math.floor(progresso(j)) + '%'))));
}

function pintarHeroi(anima) {
  const j = jogoAtual();
  const arte = $('#heroi-arte');
  const nova = el('div', { class: j.game });
  arte.append(nova);
  const velhas = [...arte.children].slice(0, -1);
  if (anima) {
    animar(nova, [{ opacity: 0, transform: 'scale(1.06)' }, { opacity: 1, transform: 'scale(1)' }], 900);
    velhas.forEach(v => { const a = animar(v, [{ opacity: 1 }, { opacity: 0 }], 500, 'ease', { fill: 'forwards' }); a ? (a.onfinish = () => v.remove()) : v.remove(); });
    animar($('#nome-jogo'), [{ opacity: 0, transform: 'translateX(-16px)', letterSpacing: '.08em' }, { opacity: 1, transform: 'none', letterSpacing: '.01em' }], 600);
  } else velhas.forEach(v => v.remove());
  $('#nome-jogo').textContent = j.title;
  pintarProgresso();
}

function pintarProgresso() {
  const j = jogoAtual();
  const pct = progresso(j);
  contar($('#pct'), Math.floor(pct));
  $('#enche').style.transform = `scaleX(${pct / 100})`;
  const n = j.lista.filter(t => tem(j, t.id)).length;
  $('#conta-total').textContent = `${n} de ${j.lista.length} troféus`;
  $('#tipos').replaceChildren(...[...'PGSB'].filter(ty => j.lista.some(t => t.tipo === ty)).map(ty => {
    const todos = j.lista.filter(t => t.tipo === ty);
    return el('span', { title: TIPO[ty] }, el('i', { class: 'med ' + ty }), el('span', {}, el('b', {}, todos.filter(t => tem(j, t.id)).length), '/' + todos.length));
  }));
}

// ------------------------------------------------------------------ lista
function filtrar() {
  const j = jogoAtual();
  const q = st.busca.trim().toLowerCase();
  return j.lista.filter(t => {
    const ok = tem(j, t.id);
    if ((st.filtro === 'obtidos' && !ok) || (st.filtro === 'faltando' && ok)) return false;
    return !q || (t.nome + ' ' + t.desc + ' ' + t.detalhe + ' ' + t.dica).toLowerCase().includes(q);
  });
}

function linha(t, j) {
  const ok = tem(j, t.id);
  const e = el('div', { class: 'linha' + (ok ? '' : ' falta'), role: 'option', 'aria-selected': String(t.id === st.sel), 'data-id': t.id, onclick: () => selecionar(t.id) },
    el('div', { class: 'ico', style: t.icone ? { backgroundImage: `url(${t.icone})` } : {} }),
    el('div', { class: 'txt' }, el('div', { class: 'nome' }, t.nome), el('div', { class: 'desc' }, t.desc)),
    el('div', { class: 'tipo' },
      el('span', {}, el('i', { class: 'med ' + t.tipo }), TIPO[t.tipo]),
      el('span', { class: 'estado' }, ok ? 'Obtido' : 'Bloqueado')),
    st.novos.has(j.comm + ':' + t.id) ? el('span', { class: 'novo' }, 'NOVO') : null);
  return e;
}

function pintarLista(anima = true, manter = false) {
  const j = jogoAtual();
  st.linhas = filtrar();
  if (!(manter && st.linhas.some(t => t.id === st.sel))) st.sel = st.linhas[0]?.id ?? null;
  const box = $('#lista');
  if (!st.linhas.length) {
    box.replaceChildren(el('div', { class: 'vazio' }, el('span', { class: 'titulo' }, 'Nenhum troféu aqui'),
      st.busca ? 'Nada bate com essa busca.' : st.filtro === 'obtidos' ? 'Ainda nenhum troféu deste jogo.' : 'Todos já foram pegos.'));
  } else {
    const rolagem = box.scrollTop;
    box.replaceChildren(...st.linhas.map(t => linha(t, j)));
    if (manter) box.scrollTop = rolagem;
    else box.scrollTop = 0;
    if (anima) cascata([...box.children]);
  }
  $('#na-lista').textContent = st.linhas.length + (st.linhas.length === 1 ? ' troféu' : ' troféus');
  pintarDetalhe(anima);
}

function selecionar(id, rolar = false) {
  if (id === st.sel) return;
  st.sel = id;
  $$('.linha').forEach(l => l.setAttribute('aria-selected', String(+l.dataset.id === id)));
  if (rolar) $(`.linha[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
  pintarDetalhe(true);
}

function pintarDetalhe(anima) {
  const j = jogoAtual();
  const t = j.lista.find(x => x.id === st.sel);
  const box = $('#detalhe');
  if (!t) { // lista vazia: as Lâminas, e a platina se já acabou
    const fim = j.lista.every(x => tem(j, x.id));
    box.replaceChildren(el('div', { class: 'det-vazio' },
      el('div', { class: 'laminas ' + j.game }),
      el('div', { class: 'caixa' }, fim ? 'Platina conquistada' : 'Nada selecionado'),
      el('p', {}, fim ? `Todos os ${j.lista.length} troféus de ${j.title}.` : 'Escolha um troféu na lista.')));
    if (anima) animar(box.firstChild.firstChild, [{ opacity: 0, transform: 'translateX(-30px) rotate(-6deg)' }, { opacity: 1, transform: 'none' }], 700);
    return;
  }
  const ok = tem(j, t.id);
  const secoes = [
    el('div', { class: 'det-sec' }, el('div', { class: 'caixa' }, 'O que pede'), el('div', { class: 'det-sep' }),
      el('p', {}, t.desc), t.desc !== t.detalhe ? el('p', { class: 'en' }, t.detalhe) : null),
  ];
  if (t.dica) secoes.push(el('div', { class: 'det-sec' }, el('div', { class: 'caixa' }, 'Como pegar'), el('div', { class: 'det-sep' }), el('p', {}, t.dica)));
  box.replaceChildren(
    el('div', { class: 'det-topo' },
      el('div', { class: 'det-ico' + (ok ? '' : ' falta'), style: t.icone ? { backgroundImage: `url(${t.icone})` } : {} }),
      el('div', {},
        el('div', { class: 'det-tipo' }, el('i', { class: 'med ' + t.tipo }), TIPO[t.tipo]),
        el('div', { class: 'det-estado' + (ok ? ' ok' : '') }, ok ? 'Obtido' : 'Ainda não obtido'),
        t.oculto ? el('div', { class: 'det-oculto' }, 'Troféu oculto') : null)),
    el('h2', { class: 'titulo det-nome' }, t.nome),
    ...secoes);
  if (anima) {
    animar(box.firstChild.firstChild, [{ opacity: 0, transform: 'scale(.92) rotate(-2deg)' }, { opacity: 1, transform: 'none' }], 420);
    cascata([...box.children].slice(1), [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], 60, 380);
  }
}

// ------------------------------------------------------------------ filtros, busca, teclado
function pintarSublinha() {
  const b = $(`.filtros button[data-f="${st.filtro}"]`);
  const s = $('#sublinha');
  s.style.width = b.offsetWidth - 28 + 'px';
  s.style.transform = `translateX(${b.offsetLeft + 14}px)`;
}

$$('.filtros button').forEach(b => b.addEventListener('click', () => {
  st.filtro = b.dataset.f;
  $$('.filtros button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  pintarSublinha();
  pintarLista();
}));

let atraso;
$('#busca').addEventListener('input', e => {
  clearTimeout(atraso);
  atraso = setTimeout(() => { st.busca = e.target.value; pintarLista(false); }, 120);
});

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') { if (e.key === 'Escape') { e.target.value = ''; st.busca = ''; pintarLista(false); } return; }
  const i = st.linhas.findIndex(t => t.id === st.sel);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const k = Math.max(0, Math.min(st.linhas.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
    if (st.linhas[k]) selecionar(st.linhas[k].id, true);
  } else if (e.key === '/' || (e.ctrlKey && e.key === 'f')) { e.preventDefault(); $('#busca').focus(); }
  else if (e.key === 'Tab' && e.ctrlKey) {
    e.preventDefault();
    const outros = st.jogos.filter(j => j.lista.length);
    trocarJogo(outros[(outros.findIndex(j => j.comm === st.cur) + 1) % outros.length].comm);
  }
});

function trocarJogo(comm) {
  if (comm === st.cur) return;
  st.cur = comm;
  st.sel = null;
  pintarJogos();
  pintarHeroi(true);
  pintarLista();
}

// ------------------------------------------------------------------ troféu chegando com o jogo aberto
function estalo(j, t) {
  const box = $('#estalo');
  box.replaceChildren(
    el('div', { class: 'ico', style: t.icone ? { backgroundImage: `url(${t.icone})` } : {} }),
    el('div', {}, el('b', {}, el('i', { class: 'med ' + t.tipo }), 'Troféu desbloqueado'), el('span', { class: 'titulo' }, t.nome),
      el('span', { class: 'mudo', style: { fontSize: '12.5px' } }, j.title)));
  box.hidden = false;
  box.style.animation = 'none';
  void box.offsetWidth;
  box.style.animation = '';
  animar(box, [{ opacity: 0, transform: 'translateX(40px)' }, { opacity: 1, transform: 'none' }], 450);
  clearTimeout(estalo.t);
  estalo.t = setTimeout(() => {
    const a = animar(box, [{ opacity: 1 }, { opacity: 0, transform: 'translateX(40px)' }], 300, 'ease-in');
    a ? (a.onfinish = () => (box.hidden = true)) : (box.hidden = true);
  }, 6000);
}

async function vigiar() {
  try {
    const r = await vt.rpc('obtidos_todos');
    let mudou = false;
    for (const j of st.jogos) {
      const x = r[j.comm];
      if (!x || st.mtimes[j.comm] === x.mtime) continue;
      st.mtimes[j.comm] = x.mtime;
      const novos = x.ids.filter(id => !j.obtidos.includes(id));
      if (novos.length || x.ids.length !== j.obtidos.length) {
        j.obtidos = x.ids;
        mudou = true;
        for (const id of novos) {
          st.novos.add(j.comm + ':' + id);
          const t = j.lista.find(t => t.id === id);
          if (t) estalo(j, t);
        }
      }
    }
    if (mudou) { pintarJogos(); pintarProgresso(); pintarLista(false, true); }
  } catch (_) { /* a ponte reinicia sozinha no próximo ciclo se cair */ }
  setTimeout(vigiar, 2000);
}

// ------------------------------------------------------------------ início
(async function iniciar() {
  montarBarra('Troféus');
  vt.aoEvento(m => {
    if (m.ev === 'log' && m.canal === 'arte') $('#carregando-txt').textContent = 'Preparando a arte do jogo';
    if (m.ev === 'caiu') avisar('Python', 'A ponte com as ferramentas fechou. Confira se o Python está instalado.', 'erro');
  });
  await carregarArte();
  try {
    st.jogos = await vt.rpc('trofeus', { idioma: IDIOMA });
  } catch (e) {
    $('#carregando').remove();
    $('#lista').replaceChildren(el('div', { class: 'vazio' }, el('span', { class: 'titulo' }, 'Não deu para ler os troféus'), e.message));
    return;
  }
  for (const j of st.jogos) if (j.erro) avisar(j.title, j.erro, 'erro');
  const comLista = st.jogos.filter(j => j.lista.length);
  if (!comLista.length) { $('#carregando').remove(); return; }
  // abre no jogo jogado por último (o que tem mais troféus recentes não dá para saber; fica o com mais progresso)
  const r = await vt.rpc('obtidos_todos').catch(() => ({}));
  comLista.sort((a, b) => (r[b.comm]?.mtime || 0) - (r[a.comm]?.mtime || 0));
  for (const j of st.jogos) st.mtimes[j.comm] = r[j.comm]?.mtime;
  st.cur = comLista[0].comm;
  pintarJogos();
  pintarHeroi(false);
  pintarLista(false);
  pintarSublinha();
  const c = $('#carregando');
  const a = animar(c, [{ opacity: 1 }, { opacity: 0 }], 450, 'ease', { fill: 'forwards' });
  a ? (a.onfinish = () => c.remove()) : c.remove();
  animar($('#heroi-arte').firstChild, [{ opacity: 0, transform: 'scale(1.08)' }, { opacity: 1, transform: 'none' }], 1400);
  animar($('#nome-jogo'), [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], 700, undefined, { delay: 150 });
  cascata([...$('#lista').children]);
  setTimeout(vigiar, 2000);
})();
window.addEventListener('resize', () => pintarSublinha());
