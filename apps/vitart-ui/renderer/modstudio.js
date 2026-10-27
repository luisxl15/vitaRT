// vitart Mod Studio: mods instalados, conversor de mods do PS2, texturas, textos e configurações. Tudo o que mexe
// em arquivo passa pela ponte (tools/vitart_ponte.py); a tela só pede e mostra.
const NAV_ICO = {
  mods: '<path d="M8 2l6 3-6 3-6-3z"/><path d="M2 8l6 3 6-3"/><path d="M2 11l6 3 6-3"/>',
  conv: '<circle cx="5.5" cy="8" r="3.6"/><circle cx="5.5" cy="8" r=".9"/><path d="M10.5 8h4M12.5 6l2 2-2 2"/>',
  tex: '<rect x="2" y="2.5" width="12" height="11"/><path d="M2 11l3.5-3.5 3 3 2-2 3.5 3.5"/><circle cx="10.5" cy="5.5" r="1"/>',
  txt: '<path d="M3 4h6M3 7h5M3 10h4"/><path d="M13.5 2.5l-5 7.5-1 3 2.3-2 5-7.5z"/>',
  cfg: '<circle cx="8" cy="8" r="2.3"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/>',
  guia: '<path d="M2 3.5c2-1 4-1 6 0v10c-2-1-4-1-6 0zM14 3.5c-2-1-4-1-6 0v10c2-1 4-1 6 0z"/>',
};
const SECOES = [
  { id: 'mods', nome: 'Mods', sobre: 'Instalados', titulo: 'Seus mods', arte: 'chave',
    sub: 'Ligue, desligue e arraste para mudar a ordem. No jogo, Options > Mods > Apply aplica na hora.' },
  { id: 'conv', nome: 'Converter PS2', sobre: 'Mods do PlayStation 2', titulo: 'Converter mod do PS2', arte: 'rocha',
    sub: 'Um patch XDelta do GoW2 de PS2 (solto ou dentro do .zip) mais a ISO original viram um mod do vitart.' },
  { id: 'tex', nome: 'Texturas', sobre: 'Editor', titulo: 'Texturas do jogo', arte: 'aguia',
    sub: 'Veja as texturas de cada WAD, exporte em PNG, troque pelas suas e salve tudo como um mod.' },
  { id: 'txt', nome: 'Textos', sobre: 'Tradução', titulo: 'Textos e tradução', arte: 'medalhao',
    sub: 'Exporte os textos do jogo, traduza o .txt e instale como mod.' },
  { id: 'cfg', nome: 'Configurações', sobre: 'Pastas e programas', titulo: 'Configurações', arte: 'rocha',
    sub: 'Onde ficam o jogo, o vitart-data e as ferramentas que a conversão usa.' },
  { id: 'guia', nome: 'Guia', sobre: 'Documentação', titulo: 'Guia de modding', arte: 'bronze',
    sub: 'Formatos, estrutura de um mod e como o vitart carrega tudo.' },
];
const st = { secao: null, mods: [], selMod: null, ocupado: false, tex: { jogo: 'gow2', wad: null, lista: [], sel: null, wads: [] } };
const canais = {}; // canal -> {registro, fim(ok, r)}

// ------------------------------------------------------------------ navegação
function montarNav() {
  $('#nav').replaceChildren(...SECOES.map(s => el('button', { 'data-s': s.id, onclick: () => abrir(s.id) },
    el('span', { html: `<svg viewBox="0 0 16 16" aria-hidden="true">${NAV_ICO[s.id]}</svg>` }).firstChild, s.nome,
    s.id === 'mods' ? el('span', { class: 'conta', id: 'conta-mods' }) : null)));
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
  arte.style.backgroundSize = s.arte === 'rocha' ? '420px' : s.arte === 'medalhao' || s.arte === 'aguia' || s.arte === 'bronze' ? 'auto 150%' : 'cover';
  arte.style.backgroundRepeat = s.arte === 'rocha' ? 'repeat' : 'no-repeat';
  animar(arte, [{ opacity: 0, transform: 'scale(1.05)' }, { opacity: 1, transform: 'none' }], 700);
  animar($('.cab-corpo'), [{ opacity: 0, transform: 'translateX(-14px)' }, { opacity: 1, transform: 'none' }], 450);
  $$('.secao').forEach(x => x.classList.toggle('ativa', x.id === 's-' + id));
  const sec = $('#s-' + id);
  if (!sec.dataset.pronta) { sec.dataset.pronta = '1'; MONTAR[id](sec); }
  animar(sec, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], 380);
  if (id === 'mods') pintarMods(true);
}

function ocupado(on) {
  st.ocupado = on;
  const e = $('#estado-ponte');
  e.classList.toggle('ocupado', on);
  e.lastChild.textContent = on ? 'Trabalhando...' : 'Ferramentas prontas';
}

// registro de um canal: as linhas da ferramenta chegam por evento
function registro(canal, alto = false) {
  const r = el('div', { class: 'registro' + (alto ? ' alto' : ''), 'aria-live': 'polite' });
  canais[canal] = { ...(canais[canal] || {}), registro: r };
  return r;
}
function escrever(canal, t) {
  const c = canais[canal];
  if (!c?.registro) return;
  const cls = /^ERRO|falhou/i.test(t) ? 'erro' : /^(pronto|==)/.test(t) ? 'ok' : '';
  c.registro.append(el('div', { class: cls }, t));
  if (c.registro.childElementCount > 2000) c.registro.firstChild.remove();
  c.registro.scrollTop = c.registro.scrollHeight;
  c.aoLog?.(t);
}
async function tarefa(canal, m, a, fim) {
  if (st.ocupado) { avisar('Espere', 'Ainda tem uma operação rodando.', 'erro'); return; }
  canais[canal].fim = fim;
  try {
    await vt.rpc(m, a);
    ocupado(true);
  } catch (e) { avisar('Não deu', e.message, 'erro'); }
}

// ------------------------------------------------------------------ Mods
function montarMods(sec) {
  sec.append(
    el('div', { class: 'barra-acoes' },
      el('span', { class: 'mudo', id: 'mods-resumo' }),
      el('div', { class: 'direita' },
        el('button', { class: 'btn fino', html: icone('pasta') + 'Pasta dos mods', onclick: () => vt.rpc('abrir', {}) }),
        el('button', { class: 'btn fino', html: icone('refazer') + 'Reconstruir menu e patches', onclick: reconstruir }))),
    el('div', { class: 'mods-grade' },
      el('div', {}, el('div', { class: 'mods-lista', id: 'mods-lista' }),
        el('div', { class: 'gaveta' }, el('div', { class: 'caixa', style: { marginBottom: '6px' } }, 'Registro'), registro('mods'))),
      el('aside', { class: 'painel mod-detalhe', id: 'mod-detalhe' })));
}

async function carregarMods() {
  st.mods = await vt.rpc('mods');
  $('#conta-mods').textContent = st.mods.length || '';
}

function pintarMods(anima) {
  const box = $('#mods-lista');
  if (!box) return;
  const ligados = st.mods.filter(m => m.ligado).length;
  $('#mods-resumo').textContent = st.mods.length ? `${st.mods.length} instalados · ${ligados} ligados` : '';
  if (!st.mods.length) {
    box.replaceChildren(el('div', { class: 'painel vazio' }, el('span', { class: 'titulo' }, 'Nenhum mod instalado'),
      el('p', {}, 'Converta um mod do PS2, troque texturas ou instale uma tradução.'),
      el('button', { class: 'btn forte', onclick: () => abrir('conv') }, 'Converter mod do PS2')));
    $('#mod-detalhe').replaceChildren();
    return;
  }
  if (!st.mods.some(m => m.id === st.selMod)) st.selMod = st.mods[0].id;
  box.replaceChildren(...st.mods.map(cartaoMod));
  if (anima) cascata([...box.children], undefined, 45, 400);
  pintarDetalheMod(anima);
}

function cartaoMod(m) {
  const liga = el('label', { class: 'chave-liga', title: m.ligado ? 'Desligar' : 'Ligar', onclick: e => e.stopPropagation() },
    el('input', { type: 'checkbox', checked: m.ligado, 'aria-label': 'Ligar ' + m.nome, onchange: e => ligar(m, e.target.checked) }), el('span'));
  const c = el('div', { class: 'mod' + (m.id === st.selMod ? ' sel' : '') + (m.ligado ? '' : ' desligado'), 'data-id': m.id,
    onclick: () => { st.selMod = m.id; $$('.mod').forEach(x => x.classList.toggle('sel', x.dataset.id === m.id)); pintarDetalheMod(true); } },
    el('div', { class: 'alca', draggable: 'true', title: 'Arraste para mudar a ordem', html: icone('arrastar') }),
    liga,
    el('div', {},
      el('div', { class: 'nome' }, m.nome),
      el('div', { class: 'linha2' }, el('span', {}, m.autor || 'autor desconhecido'), el('span', {}, `${m.arquivos} arquivos`), el('span', {}, tamanho(m.tamanho)))),
    el('span', { class: 'selo ' + m.jogo }, m.jogo === 'gow1' ? 'God of War' : 'God of War II'));
  arrastavel(c);
  return c;
}

// arrastar pela alça: a linha some um pouco e um filete dourado mostra onde vai cair
let arrastado = null;
function arrastavel(c) {
  const alca = c.querySelector('.alca');
  alca.addEventListener('dragstart', e => { arrastado = c; c.classList.add('arrastando'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setDragImage(c, 20, 20); });
  alca.addEventListener('dragend', () => { c.classList.remove('arrastando'); $$('.mod').forEach(x => x.classList.remove('alvo-cima', 'alvo-baixo')); arrastado = null; });
  c.addEventListener('dragover', e => {
    if (!arrastado || arrastado === c) return;
    e.preventDefault();
    const r = c.getBoundingClientRect();
    const cima = e.clientY < r.top + r.height / 2;
    c.classList.toggle('alvo-cima', cima);
    c.classList.toggle('alvo-baixo', !cima);
  });
  c.addEventListener('dragleave', () => c.classList.remove('alvo-cima', 'alvo-baixo'));
  c.addEventListener('drop', async e => {
    e.preventDefault();
    if (!arrastado || arrastado === c) return;
    const cima = c.classList.contains('alvo-cima');
    const ids = st.mods.map(m => m.id).filter(i => i !== arrastado.dataset.id);
    ids.splice(ids.indexOf(c.dataset.id) + (cima ? 0 : 1), 0, arrastado.dataset.id);
    // FLIP: guarda as posições, reordena, e anima cada cartão do lugar velho ao novo
    const antes = new Map($$('.mod').map(x => [x.dataset.id, x.getBoundingClientRect().top]));
    st.mods = await vt.rpc('ordem', { ids });
    pintarMods(false);
    $$('.mod').forEach(x => {
      const d = (antes.get(x.dataset.id) || 0) - x.getBoundingClientRect().top;
      if (d) animar(x, [{ transform: `translateY(${d}px)` }, { transform: 'none' }], 320);
    });
    avisar('Ordem mudada', 'Reconstrua para o menu do jogo mostrar a ordem nova.');
  });
}

async function ligar(m, on) {
  try {
    st.mods = await vt.rpc('ligar', { id: m.id, on });
    pintarMods(false);
    escrever('mods', `${m.id} ${on ? 'ligado' : 'desligado'} (vale ao abrir o jogo)`);
  } catch (e) { avisar('Não deu', e.message, 'erro'); }
}

function pintarDetalheMod(anima) {
  const m = st.mods.find(x => x.id === st.selMod);
  const box = $('#mod-detalhe');
  if (!m) { box.replaceChildren(); return; }
  box.replaceChildren(
    el('span', { class: 'selo ' + m.jogo }, m.jogo === 'gow1' ? 'God of War' : 'God of War II'),
    el('h3', {}, m.nome),
    el('p', { class: 'desc' }, m.desc || 'Sem descrição.'),
    el('dl', {},
      el('dt', {}, 'Estado'), el('dd', {}, m.ligado ? 'Ligado' : 'Desligado'),
      el('dt', {}, 'Autor'), el('dd', {}, m.autor || '—'),
      el('dt', {}, 'Versão'), el('dd', {}, m.versao || '—'),
      el('dt', {}, 'Id'), el('dd', {}, m.id),
      el('dt', {}, 'Tamanho'), el('dd', {}, `${tamanho(m.tamanho)} em ${m.arquivos} arquivos`)),
    el('div', { class: 'caixa', style: { marginBottom: '6px' } }, 'Arquivos que troca'),
    el('div', { class: 'arqs' }, m.lista.join('\n') + (m.arquivos > m.lista.length ? '\n...' : '')),
    el('div', { class: 'acoes' },
      el('button', { class: 'btn fino', html: icone('pasta') + 'Abrir pasta', onclick: () => vt.rpc('abrir', { pasta: m.pasta }) }),
      el('button', { class: 'btn fino perigo', html: icone('lixo') + 'Remover', onclick: () => remover(m) })));
  if (anima) cascata([...box.children], [{ opacity: 0, transform: 'translateX(10px)' }, { opacity: 1, transform: 'none' }], 30, 320);
}

async function remover(m) {
  if (!await confirmar('Remover mod', `"${m.nome}" vai para vitart-data/mods_removidos. Nada é apagado.`, 'Remover', true)) return;
  try {
    const r = await vt.rpc('remover', { id: m.id });
    st.mods = r.mods;
    escrever('mods', `${m.id} movido para ${r.destino}`);
    pintarMods(false);
    await carregarMods();
    reconstruir();
  } catch (e) { avisar('Não deu', e.message, 'erro'); }
}

function reconstruir() {
  tarefa('mods', 'reconstruir', { canal: 'mods' }, async ok => {
    await carregarMods();
    pintarMods(false);
    avisar(ok ? 'Pronto' : 'Falhou', ok ? 'Menu e patches reconstruídos.' : 'Veja o registro.', ok ? '' : 'erro');
  });
}

// ------------------------------------------------------------------ Converter PS2
function campo(rotulo, entrada, ajuda, largo) {
  return el('div', { class: 'campo' + (largo ? ' largo' : '') }, el('label', {}, rotulo), entrada, ajuda ? el('div', { class: 'ajuda' }, ajuda) : null);
}
function entradaArquivo(id, filtros, aoEscolher, pasta = false) {
  const inp = el('input', { class: 'entrada', id, spellcheck: 'false' });
  return el('div', { class: 'arquivo' }, inp, el('button', { class: 'btn fino', onclick: async () => {
    const p = pasta ? await vt.escolherPasta() : await vt.abrirArquivo(filtros);
    if (p) { inp.value = p; aoEscolher?.(p); }
  } }, 'Escolher'));
}

function montarConv(sec) {
  const passos = [['Patch', 'aplica o xdelta em fluxo'], ['Conversão', 'WADs do PS2 para o Vita'], ['Instalação', 'vira um mod do vitart'], ['Menu', 'patches e página Mods']];
  sec.append(
    el('div', { class: 'passos', id: 'passos' }, ...passos.map(([b, s]) => el('div', { class: 'passo' }, el('b', {}, b), el('span', {}, s)))),
    el('div', { class: 'form' },
      campo('Patch do mod', entradaArquivo('c-patch', [{ name: 'Patch', extensions: ['xdelta', 'xd3', 'vcdiff', 'zip'] }], p => {
        if (!$('#c-nome').value) {
          const base = p.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
          $('#c-nome').value = base.slice(0, 24);
          $('#c-id').value = base.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_|_$/g, '').slice(0, 32);
        }
      }), '.xdelta solto ou o .zip do mod com ele dentro.'),
      campo('ISO original do PS2', entradaArquivo('c-iso', [{ name: 'ISO', extensions: ['iso', '7z'] }]), 'A mesma região e versão que o mod pede (.iso ou .7z).'),
      campo('Nome no menu', el('input', { class: 'entrada', id: 'c-nome', maxlength: 24 }), 'Até 24 letras: é o que aparece em Options > Mods.'),
      campo('Id (pasta)', el('input', { class: 'entrada', id: 'c-id', spellcheck: 'false' })),
      campo('Autor(es)', el('input', { class: 'entrada', id: 'c-autor' }), 'Dê o crédito de quem fez o mod.'),
      campo('Jogo', el('select', { class: 'entrada', id: 'c-jogo' }, el('option', { value: 'gow2' }, 'God of War II')), 'GoW1 ainda não tem conversor de malha do PS2.'),
      campo('Descrição', el('input', { class: 'entrada', id: 'c-desc' }), null, true)),
    el('div', { class: 'linha-acao' },
      el('button', { class: 'btn forte', id: 'c-ir', onclick: converter }, 'Converter e instalar'),
      el('label', { class: 'marcar' }, el('span', { class: 'chave-liga' }, el('input', { type: 'checkbox', id: 'c-manter' }), el('span')), 'Manter a pasta de trabalho')),
    el('div', { class: 'andamento', id: 'c-andamento' }),
    registro('conv', true));
  canais.conv.aoLog = t => {
    const k = /== (aplicando|extraindo|originais)/.test(t) ? 0 : /== convertendo/.test(t) ? 1 : /instal/i.test(t) && !/^>/.test(t) ? 2 : /patch base/.test(t) ? 3 : -1;
    if (k >= 0) marcarPasso(k);
  };
}
function marcarPasso(k, fim) {
  $$('.passo').forEach((p, i) => {
    p.classList.toggle('feito', fim ? i <= k : i < k);
    const agora = !fim && i === k;
    if (agora && !p.classList.contains('agora')) animar(p, [{ transform: 'translateY(-3px)' }, { transform: 'none' }], 400);
    p.classList.toggle('agora', agora);
  });
}
function converter() {
  const v = id => $('#' + id).value.trim();
  if (!v('c-patch') || !v('c-iso') || !v('c-nome')) { avisar('Faltam dados', 'Escolha o patch, a ISO e dê um nome ao mod.', 'erro'); return; }
  canais.conv.registro.replaceChildren();
  marcarPasso(0);
  $('#c-andamento').classList.add('on');
  $('#c-ir').disabled = true;
  tarefa('conv', 'converter', { jogo: v('c-jogo'), patch: v('c-patch'), iso: v('c-iso'), nome: v('c-nome'), id: v('c-id'), autor: v('c-autor'), desc: v('c-desc'), manter: $('#c-manter').checked },
    async ok => {
      $('#c-andamento').classList.remove('on');
      $('#c-ir').disabled = false;
      if (ok) marcarPasso(3, true); else $$('.passo').forEach(p => p.classList.remove('agora'));
      await carregarMods();
      avisar(ok ? 'Mod instalado' : 'A conversão falhou', ok ? `"${v('c-nome')}" está na aba Mods. Ligue lá ou em Options > Mods.` : 'Veja o registro.', ok ? '' : 'erro');
    });
}

// ------------------------------------------------------------------ Texturas
function montarTex(sec) {
  const filtro = el('input', { class: 'entrada', placeholder: 'Filtrar WADs (ex.: r_hero, pal)', oninput: e => pintarWads(e.target.value) });
  sec.append(
    el('div', { class: 'barra-acoes' },
      el('select', { class: 'entrada', style: { width: '180px' }, onchange: e => { st.tex.jogo = e.target.value; carregarWads(); } },
        el('option', { value: 'gow2' }, 'God of War II'), el('option', { value: 'gow1' }, 'God of War')),
      el('span', { class: 'mudo', id: 'tex-resumo' }),
      el('div', { class: 'direita' }, el('button', { class: 'btn fino', html: icone('exportar') + 'Exportar todas do WAD', onclick: exportarTodas }))),
    el('div', { class: 'tex' },
      el('div', { class: 'wads' }, filtro, el('div', { class: 'wads-lista', id: 'wads' })),
      el('div', { class: 'grade', id: 'grade' }, el('div', { class: 'vazio', style: { gridColumn: '1/-1' } }, 'Escolha um WAD à esquerda.')),
      el('aside', { class: 'painel previa', id: 'previa' })),
    registro('tex'));
  canais.tex.registro.style.cssText = 'height:70px;margin-top:12px';
  carregarWads();
  pintarPrevia();
}
async function carregarWads() {
  try {
    st.tex.wads = await vt.rpc('wads', { jogo: st.tex.jogo });
    pintarWads('');
  } catch (e) { escrever('tex', 'ERRO: ' + e.message); }
}
function pintarWads(f) {
  const q = f.toLowerCase();
  $('#wads').replaceChildren(...st.tex.wads.filter(w => w.toLowerCase().includes(q)).map(w =>
    el('button', { 'aria-current': String(w === st.tex.wad), onclick: () => abrirWad(w) }, w.replace(/^wad\//, '').replace('.wad_psp2', ''))));
}
async function abrirWad(w) {
  st.tex.wad = w;
  st.tex.sel = null;
  $$('#wads button').forEach(b => b.setAttribute('aria-current', String(b.textContent === w.replace(/^wad\//, '').replace('.wad_psp2', ''))));
  const grade = $('#grade');
  grade.replaceChildren(el('div', { class: 'vazio', style: { gridColumn: '1/-1' } }, 'Lendo o WAD...'));
  try {
    st.tex.lista = await vt.rpc('texturas', { jogo: st.tex.jogo, wad: w });
  } catch (e) { grade.replaceChildren(el('div', { class: 'vazio', style: { gridColumn: '1/-1' } }, e.message)); return; }
  $('#tex-resumo').textContent = `${w} · ${st.tex.lista.length} texturas`;
  if (!st.tex.lista.length) { grade.replaceChildren(el('div', { class: 'vazio', style: { gridColumn: '1/-1' } }, 'Este WAD não tem texturas.')); pintarPrevia(); return; }
  grade.replaceChildren(...st.tex.lista.map(t => el('div', { class: 'tile', 'data-n': t.nome, onclick: () => escolherTex(t.nome) },
    el('div', { class: 'mini' }), el('div', { class: 'n', title: t.nome }, t.nome.replace(/^~[0-9a-f]+/, '').split('~')[0]),
    el('div', { class: 'troca' }, t.troca ? 'TROCADA' : ''))));
  cascata($$('.tile', grade), [{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }], 14, 260);
  escolherTex(st.tex.lista[0].nome);
  // miniaturas em lotes, para a grade aparecer logo
  const nomes = st.tex.lista.map(t => t.nome);
  for (let i = 0; i < nomes.length && st.tex.wad === w; i += 24) {
    const r = await vt.rpc('miniaturas', { jogo: st.tex.jogo, wad: w, nomes: nomes.slice(i, i + 24) }).catch(() => ({}));
    if (st.tex.wad !== w) break;
    for (const [n, url] of Object.entries(r)) {
      const m = $(`.tile[data-n="${CSS.escape(n)}"] .mini`);
      if (m && url) { m.style.setProperty('--img', `url(${url})`); animar(m, [{ opacity: 0 }, { opacity: 1 }], 300); }
    }
  }
}
async function escolherTex(n) {
  st.tex.sel = n;
  $$('.tile').forEach(t => t.classList.toggle('sel', t.dataset.n === n));
  pintarPrevia();
  try {
    const url = await vt.rpc('previa', { jogo: st.tex.jogo, wad: st.tex.wad, nome: n });
    if (st.tex.sel === n) { $('#previa .quadro').style.setProperty('--img', `url(${url})`); animar($('#previa .quadro'), [{ opacity: .3 }, { opacity: 1 }], 250); }
  } catch (e) { escrever('tex', 'ERRO: ' + e.message); }
}
async function pintarPrevia() {
  const box = $('#previa');
  const t = st.tex.lista.find(x => x.nome === st.tex.sel);
  const trocas = await vt.rpc('trocas').catch(() => []);
  const doJogo = trocas.filter(x => x.jogo === st.tex.jogo);
  box.replaceChildren(
    el('div', { class: 'quadro' }),
    el('div', { class: 'info' }, t ? `${t.nome}\n${t.w}×${t.h} · ${t.fmt}${t.troca ? ' · trocada por ' + t.troca : ''}` : 'Nenhuma textura selecionada.'),
    el('div', { class: 'acoes' },
      el('button', { class: 'btn fino', disabled: !t, html: icone('exportar') + 'Exportar', onclick: exportarPng }),
      el('button', { class: 'btn fino', disabled: !t, html: icone('importar') + 'Trocar', onclick: trocarPng }),
      el('button', { class: 'btn fino', disabled: !t?.troca, html: icone('desfazer') + 'Desfazer', onclick: desfazerPng, style: { gridColumn: '1/-1' } })),
    el('div', { class: 'pendentes' },
      el('div', { class: 'caixa' }, `Trocas pendentes: ${doJogo.length}`),
      el('input', { class: 'entrada', id: 't-nome', placeholder: 'Nome do mod', maxlength: 24 }),
      el('input', { class: 'entrada', id: 't-autor', placeholder: 'Autor' }),
      el('button', { class: 'btn forte', disabled: !doJogo.length, onclick: criarModTex }, 'Criar mod com as trocas')));
}
const nomePng = n => n.replace(/^~|~$/g, '').replace(/~/g, '_') + '.png';
async function exportarPng() {
  const p = await vt.salvarArquivo(nomePng(st.tex.sel), [{ name: 'PNG', extensions: ['png'] }]);
  if (!p) return;
  await vt.rpc('exportar_png', { jogo: st.tex.jogo, wad: st.tex.wad, nome: st.tex.sel, saida: p }).then(() => avisar('Exportada', p)).catch(e => avisar('Não deu', e.message, 'erro'));
}
async function exportarTodas() {
  if (!st.tex.wad) return;
  const d = await vt.escolherPasta();
  if (!d) return;
  vt.rpc('exportar_todas', { jogo: st.tex.jogo, wad: st.tex.wad, pasta: d }).then(n => avisar('Exportadas', `${n} texturas em ${d}`)).catch(e => avisar('Não deu', e.message, 'erro'));
}
async function trocarPng() {
  const p = await vt.abrirArquivo([{ name: 'Imagens', extensions: ['png', 'jpg', 'bmp', 'tga'] }]);
  if (!p) return;
  try {
    const r = await vt.rpc('trocar', { jogo: st.tex.jogo, wad: st.tex.wad, nome: st.tex.sel, png: p });
    if (r.nota) escrever('tex', `${p.split(/[\\/]/).pop()}: ${r.nota}`);
    const t = st.tex.lista.find(x => x.nome === st.tex.sel);
    t.troca = p.split(/[\\/]/).pop();
    $(`.tile[data-n="${CSS.escape(t.nome)}"] .troca`).textContent = 'TROCADA';
    $(`.tile[data-n="${CSS.escape(t.nome)}"] .mini`).style.setProperty('--img', `url(${r.previa})`);
    await pintarPrevia();
    $('#previa .quadro').style.setProperty('--img', `url(${r.previa})`);
  } catch (e) { avisar('Não deu', e.message, 'erro'); }
}
async function desfazerPng() {
  const url = await vt.rpc('desfazer', { jogo: st.tex.jogo, wad: st.tex.wad, nome: st.tex.sel });
  const t = st.tex.lista.find(x => x.nome === st.tex.sel);
  t.troca = '';
  $(`.tile[data-n="${CSS.escape(t.nome)}"] .troca`).textContent = '';
  $(`.tile[data-n="${CSS.escape(t.nome)}"] .mini`).style.setProperty('--img', `url(${url})`);
  await pintarPrevia();
  $('#previa .quadro').style.setProperty('--img', `url(${url})`);
}
function criarModTex() {
  const nome = $('#t-nome').value.trim();
  if (!nome) { avisar('Falta o nome', 'Dê um nome ao mod.', 'erro'); return; }
  tarefa('tex', 'criar_mod_texturas', { jogo: st.tex.jogo, nome, autor: $('#t-autor').value.trim() }, async ok => {
    await carregarMods();
    if (st.tex.wad) await abrirWad(st.tex.wad);
    avisar(ok ? 'Mod criado' : 'Falhou', ok ? `"${nome}" instalado. Ligue na aba Mods.` : 'Veja o registro.', ok ? '' : 'erro');
  });
}

// ------------------------------------------------------------------ Textos
function montarTxt(sec) {
  sec.append(
    el('div', { class: 'nota', style: { marginBottom: '20px', maxWidth: '980px' } },
      el('div', {}, 'Exporte os textos (MSGS_TXT, os do modo PS TV que o vitart mostra), traduza o .txt mantendo as linhas ',
        el('code', {}, '*N*'), ' e as marcas como ', el('code', {}, '[XButton]'),
        ', e instale. A fonte do jogo não tem maiúsculas acentuadas nem ã/õ: o kit troca por A, E, U e ä/ö. Vale ao abrir o jogo.')),
    el('div', { class: 'form' },
      campo('Jogo', el('select', { class: 'entrada', id: 'x-jogo' }, el('option', { value: 'gow2' }, 'God of War II'), el('option', { value: 'gow1' }, 'God of War'))),
      el('div', { class: 'campo', style: { alignSelf: 'end' } }, el('button', { class: 'btn', html: icone('exportar') + 'Exportar os textos originais', onclick: exportarTextos })),
      campo('Arquivo .txt traduzido', entradaArquivo('x-arq', [{ name: 'Texto', extensions: ['txt'] }]), null, true),
      campo('Nome no menu', el('input', { class: 'entrada', id: 'x-nome', value: 'Tradução', maxlength: 24 })),
      campo('Id (pasta)', el('input', { class: 'entrada', id: 'x-id', spellcheck: 'false' })),
      campo('Autor(es)', el('input', { class: 'entrada', id: 'x-autor' }))),
    el('div', { class: 'linha-acao' }, el('button', { class: 'btn forte', onclick: instalarTextos }, 'Instalar tradução')),
    registro('txt', true));
}
async function exportarTextos() {
  const jogo = $('#x-jogo').value;
  const p = await vt.salvarArquivo(`${jogo}_MSGS_TXT.txt`, [{ name: 'Texto', extensions: ['txt'] }]);
  if (!p) return;
  vt.rpc('exportar_textos', { jogo, saida: p }).then(() => { escrever('txt', `textos de ${jogo} salvos em ${p}`); avisar('Exportado', p); })
    .catch(e => avisar('Não deu', e.message, 'erro'));
}
function instalarTextos() {
  const v = id => $('#' + id).value.trim();
  if (!v('x-arq') || !v('x-nome')) { avisar('Faltam dados', 'Escolha o .txt traduzido e dê um nome ao mod.', 'erro'); return; }
  tarefa('txt', 'instalar_textos', { jogo: v('x-jogo'), arquivo: v('x-arq'), nome: v('x-nome'), id: v('x-id'), autor: v('x-autor') }, async ok => {
    await carregarMods();
    avisar(ok ? 'Tradução instalada' : 'Falhou', ok ? 'Ligue na aba Mods e abra o jogo de novo.' : 'Veja o registro.', ok ? '' : 'erro');
  });
}

// ------------------------------------------------------------------ Configurações
async function montarCfg(sec) {
  const cfg = await vt.rpc('config').catch(() => ({}));
  const linhas = [['app', 'Pasta do jogo', 'PCSA00126, com exec/*.psarc', true], ['data', 'Pasta vitart-data', '', true],
    ['work', 'Pasta de trabalho', 'temporários da conversão', true], ['xdelta3', 'xdelta3.exe', 'github.com/jmacd/xdelta-gpl/releases', false],
    ['sevenzip', '7z.exe', 'para ISO dentro de .7z', false], ['python', 'Python', '', false]];
  sec.append(
    el('div', { class: 'form' }, ...linhas.map(([k, rot, aj, pasta]) => {
      const c = campo(rot, entradaArquivo('g-' + k, [], null, pasta), aj, true);
      c.querySelector('input').value = cfg[k] || '';
      return c;
    })),
    el('div', { class: 'linha-acao' }, el('button', { class: 'btn forte', onclick: async () => {
      const a = Object.fromEntries(linhas.map(([k]) => [k, $('#g-' + k).value]));
      vt.rpc('salvar_config', a).then(p => avisar('Salvo', p)).catch(e => avisar('Não deu', e.message, 'erro'));
    } }, 'Salvar')));
}

// ------------------------------------------------------------------ Guia
async function montarGuia(sec) {
  const md = await vt.rpc('ajuda').catch(e => 'Guia não encontrado: ' + e.message);
  sec.append(el('article', { class: 'guia', html: markdown(md) }));
}

const MONTAR = { mods: montarMods, conv: montarConv, tex: montarTex, txt: montarTxt, cfg: montarCfg, guia: montarGuia };

// ------------------------------------------------------------------ eventos da ponte e início
vt.aoEvento(m => {
  if (m.ev === 'log') escrever(m.canal, m.t);
  else if (m.ev === 'fim') {
    ocupado(false);
    const f = canais[m.canal]?.fim;
    if (canais[m.canal]) canais[m.canal].fim = null;
    f?.(m.ok, m.r);
  } else if (m.ev === 'caiu') {
    $('#estado-ponte').classList.add('caiu');
    $('#estado-ponte').lastChild.textContent = 'Python fechou';
    avisar('Python', 'A ponte com as ferramentas fechou. Confira se o Python está instalado.', 'erro');
  }
});

(async function iniciar() {
  montarBarra('Mod Studio');
  montarNav();
  await carregarArte();
  await carregarMods().catch(e => avisar('Mods', e.message, 'erro'));
  abrir('mods');
  const c = $('#carregando');
  const a = animar(c, [{ opacity: 1 }, { opacity: 0 }], 450, 'ease', { fill: 'forwards' });
  a ? (a.onfinish = () => c.remove()) : c.remove();
  cascata($$('#nav button'), [{ opacity: 0, transform: 'translateX(-12px)' }, { opacity: 1, transform: 'none' }], 50, 380);
})();
