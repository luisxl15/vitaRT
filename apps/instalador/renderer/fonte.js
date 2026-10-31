// A fonte dos menus do God of War (tirada do jogo por tools/vitart_arte.py): um atlas com os glifos e um JSON com
// largura e linha de base de cada um. texto() devolve um <canvas> com a frase em branco; a cor e o brilho vêm do
// CSS (filtros), para a mesma imagem servir para o item normal, o selecionado e o apagado.
const Fonte = (() => {
  let atlas = null, meta = null;
  // as medidas vêm de ../arte/fonte_meta.js (window.FONTE_META, gerado na montagem: fetch não lê file://)
  const pronta = new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = '../arte/fonte.png'; })
    .then(i => { atlas = i; meta = window.FONTE_META; });

  // tam = altura da capital em px de CSS
  function texto(str, tam = 22) {
    const G = meta.glifos, k = tam / meta.capital, dpr = window.devicePixelRatio || 1;
    let w = 0;
    for (const c of str) w += G[c] ? G[c][2] + meta.entre : meta.espaco;
    const sobe = 26 * meta.escala, desce = 8 * meta.escala; // acento em cima, rabicho embaixo
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(w * k * dpr) + 2;
    cv.height = Math.ceil((sobe + desce) * k * dpr);
    cv.style.width = cv.width / dpr + 'px';
    cv.style.height = cv.height / dpr + 'px';
    const g = cv.getContext('2d');
    g.scale(k * dpr, k * dpr);
    let x = 0;
    for (const c of str) {
      const q = G[c];
      if (!q) { x += meta.espaco; continue; }
      g.drawImage(atlas, q[0], q[1], q[2], q[3], x, sobe - q[4], q[2], q[3]);
      x += q[2] + meta.entre;
    }
    cv.className = 'gw';
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', str);
    return cv;
  }
  // troca o conteúdo de um elemento pela frase na fonte do jogo (data-tam no elemento, ou o padrão)
  function escrever(el, str, tam) {
    el.replaceChildren(texto(str, tam || +el.dataset.tam || 22));
    el.dataset.t = str;
  }
  return { pronta, texto, escrever };
})();
