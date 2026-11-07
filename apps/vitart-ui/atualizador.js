// Atualizações e pacotes opcionais do Settings, pelas releases do GitHub do projeto.
//
// Cada pacote da release são arquivos soltos "<pacote>__manifesto.bin" e "<pacote>__gow-NN.bin" (o formato VTPK do
// instalador, tools/empacotar_instalador.js, cifrado com a chave tirada do PKG e do work.bin). "atualizacao" traz o
// que mudou no vitart (exe, DLLs, shaders, ferramentas); "opcional-<nome>" são as texturas HD, o PBR, o áudio do PS2 e
// os vídeos HD. A chave fica em data/vitart_chave.bin desde a instalação; sem ela, o Settings pede o work.bin e o PKG
// uma vez. VITART_ATUALIZACAO_FONTE=<pasta> (testes): release.json e os arquivos numa pasta local, sem internet.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_GH = 'luisxl15/GOD-OF-WAR-HD-COLLECTION';
const M = (() => {
  for (const p of ['./motor.js', '../instalador/motor.js']) {
    try { return require(p); } catch (_) { /* o outro caminho */ }
  }
  throw new Error('motor.js do instalador não encontrado');
})();

const versaoLocal = jogo => {
  try { return fs.readFileSync(path.join(jogo, 'data', 'versao.txt'), 'utf8').trim(); } catch (_) { return ''; }
};
// "v0.2.10" > "v0.2.9"
function maisNova(a, b) {
  const n = s => (s || '').replace(/^v/i, '').split(/[.-]/).map(x => parseInt(x, 10) || 0);
  const x = n(a), y = n(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}

async function release() {
  const fonte = process.env.VITART_ATUALIZACAO_FONTE;
  if (fonte) {
    const r = JSON.parse(fs.readFileSync(path.join(fonte, 'release.json'), 'utf8'));
    r.assets = fs.readdirSync(fonte).filter(f => f.includes('__')).map(f => ({ name: f, size: fs.statSync(path.join(fonte, f)).size,
      browser_download_url: 'arquivo:' + path.join(fonte, f) }));
    return r;
  }
  const r = await fetch(`https://api.github.com/repos/${REPO_GH}/releases/latest`, {
    headers: { 'User-Agent': 'vitart-settings', Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error('GitHub respondeu ' + r.status);
  return r.json();
}

// o que tem na release: versão, notas e os pacotes (com os arquivos de cada um)
async function verificar(jogo) {
  const r = await release();
  const pacotes = {};
  for (const a of r.assets || []) {
    const [pac, arq] = a.name.split('__');
    if (!arq) continue;
    (pacotes[pac] ||= { nome: pac, tamanho: 0, arquivos: [] }).arquivos.push({ nome: arq, url: a.browser_download_url, tamanho: a.size });
    pacotes[pac].tamanho += a.size;
  }
  const local = versaoLocal(jogo);
  const opcionais = Object.values(pacotes).filter(p => p.nome.startsWith('opcional-')).map(p => ({
    ...p, instalado: instaladoOpcional(jogo, p.nome.slice(9)) }));
  return { local, remota: r.tag_name, notas: r.body || '', nova: !!pacotes.atualizacao && (!local || maisNova(r.tag_name, local)),
    atualizacao: pacotes.atualizacao || null, opcionais, pagina: r.html_url || '' };
}
function instaladoOpcional(jogo, nome) {
  const d = { texturas_hd: 'data/texpack', pbr: 'data/pbr', audio_ps2: 'data/ps2audio.bin', videos_hd: 'data/videos' }[nome];
  return !!d && fs.existsSync(path.join(jogo, ...d.split('/')));
}

async function baixar(arq, destino, aoAndar) {
  if (arq.url.startsWith('arquivo:')) {
    fs.copyFileSync(arq.url.slice(8), destino);
    aoAndar(arq.tamanho);
    return;
  }
  const r = await fetch(arq.url, { headers: { 'User-Agent': 'vitart-settings' } });
  if (!r.ok || !r.body) throw new Error('download de ' + arq.nome + ': ' + r.status);
  const fd = fs.openSync(destino + '.parcial', 'w');
  try {
    for await (const pedaco of r.body) {
      fs.writeSync(fd, pedaco);
      aoAndar(pedaco.length);
    }
  } finally { fs.closeSync(fd); }
  fs.renameSync(destino + '.parcial', destino);
}

function jogoAberto() {
  try {
    const t = execFileSync('tasklist', ['/fo', 'csv', '/nh'], { windowsHide: true, encoding: 'utf8' }).toLowerCase();
    return t.includes('"vitart.exe"') || t.includes('"god of war collection.exe"');
  } catch (_) { return false; }
}

function chave(jogo) {
  const p = path.join(jogo, 'data', 'vitart_chave.bin');
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
}
// sem a chave salva (instalação antiga): sai do work.bin e do PKG, como no instalador
async function chaveDosArquivos(jogo, rif, pkg, aoAndar) {
  const klic = M.lerLicenca(fs.readFileSync(rif));
  M.conferirCabecalhoPkg(pkg);
  const sha = await M.hashPkg(pkg, (f, t) => aoAndar?.(f, t));
  const K = M.derivar(klic, sha);
  fs.mkdirSync(path.join(jogo, 'data'), { recursive: true });
  fs.writeFileSync(path.join(jogo, 'data', 'vitart_chave.bin'), K);
  return K;
}

// baixa o pacote para data/_downloads/<pacote>, confere a chave e instala por cima da pasta do jogo
async function instalarPacote(jogo, pac, aoAndar, tag) {
  if (jogoAberto()) throw Object.assign(new Error('Feche o jogo antes de atualizar.'), { codigo: 'jogo_aberto' });
  const K = chave(jogo);
  if (!K) throw Object.assign(new Error('Falta a chave do jogo: aponte o work.bin e o PKG uma vez.'), { codigo: 'sem_chave' });
  const dir = path.join(jogo, 'data', '_downloads', pac.nome);
  fs.mkdirSync(dir, { recursive: true });
  let feito = 0;
  for (const a of pac.arquivos) {
    const dst = path.join(dir, a.nome);
    if (fs.existsSync(dst) && fs.statSync(dst).size === a.tamanho) { feito += a.tamanho; continue; } // já baixado
    await baixar(a, dst, n => { feito += n; aoAndar('baixando', feito, pac.tamanho); });
  }
  const { cab, cifrado } = M.lerCabecalho(dir);
  if (M.verificaChave(K) !== cab.verifica_chave) throw Object.assign(new Error('O pacote não abre com a chave deste jogo.'), { codigo: 'chave' });
  const man = M.lerManifesto(cifrado, K);
  await M.instalar(dir, man, K, jogo, (f, t) => aoAndar('instalando', f, t));
  if (tag && pac.nome === 'atualizacao') fs.writeFileSync(path.join(jogo, 'data', 'versao.txt'), tag + '\n');
  fs.rmSync(dir, { recursive: true, force: true }); // os blocos baixados já viraram arquivos do jogo
  return { arquivos: man.arquivos.length };
}

module.exports = { verificar, instalarPacote, chaveDosArquivos, maisNova, versaoLocal };
