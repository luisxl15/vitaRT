// Markdown -> HTML só com o que o guia de modding usa: títulos, parágrafos, listas, tabelas, citações, blocos de
// código, `código`, **negrito**, *itálico* e [links](url). Escapa tudo antes, então o texto não vira HTML.
function markdown(md) {
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const inline = s => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => /^https?:/.test(u) ? `<a href="${u}" target="_blank">${t}</a>` : `<span class="lnk">${t}</span>`);
  const linhas = md.replace(/\r/g, '').split('\n');
  const out = [];
  for (let i = 0; i < linhas.length;) {
    const l = linhas[i];
    if (/^```/.test(l)) {
      const buf = [];
      for (i++; i < linhas.length && !/^```/.test(linhas[i]); i++) buf.push(linhas[i]);
      i++;
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
    } else if (/^#{1,4} /.test(l)) {
      const n = l.match(/^#+/)[0].length;
      out.push(`<h${n}>${inline(l.slice(n + 1))}</h${n}>`);
      i++;
    } else if (/^\|/.test(l)) {
      const rows = [];
      for (; i < linhas.length && /^\|/.test(linhas[i]); i++) rows.push(linhas[i]);
      const cel = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const corpo = rows.filter((_, k) => k !== 1 || !/^[\s|:-]+$/.test(rows[1]));
      out.push('<table>' + corpo.map((r, k) => '<tr>' + cel(r).map(c => k === 0 ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</table>');
    } else if (/^\s*([-*]|\d+\.) /.test(l)) {
      const ord = /^\s*\d+\./.test(l);
      const itens = [];
      for (; i < linhas.length && (/^\s*([-*]|\d+\.) /.test(linhas[i]) || (/^\s{2,}\S/.test(linhas[i]) && itens.length)); i++) {
        if (/^\s*([-*]|\d+\.) /.test(linhas[i])) itens.push(linhas[i].replace(/^\s*([-*]|\d+\.) /, ''));
        else itens[itens.length - 1] += ' ' + linhas[i].trim();
      }
      out.push(`<${ord ? 'ol' : 'ul'}>` + itens.map(t => `<li>${inline(t)}</li>`).join('') + `</${ord ? 'ol' : 'ul'}>`);
    } else if (/^> /.test(l)) {
      const buf = [];
      for (; i < linhas.length && /^> /.test(linhas[i]); i++) buf.push(linhas[i].slice(2));
      out.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`);
    } else if (!l.trim()) {
      i++;
    } else {
      const buf = [];
      for (; i < linhas.length && linhas[i].trim() && !/^(#{1,4} |```|\||\s*([-*]|\d+\.) |> )/.test(linhas[i]); i++) buf.push(linhas[i]);
      out.push(`<p>${inline(buf.join(' '))}</p>`);
    }
  }
  return out.join('\n');
}
