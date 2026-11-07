// Empacota a pasta do jogo montada (tools/montar_jogo.py) nos dados cifrados do instalador.
//
//   node tools/empacotar_instalador.js <pasta do jogo> <saída\dados> <work.bin ou .rif> <SHA-256 do PKG USA>
//                                      [--sem=<caminho>]... [--so=<caminho>]... [--troca=<pasta>]
//
// --sem pula o que começa com o caminho (relativo à pasta do jogo, com /); --troca põe os arquivos da pasta no lugar dos
// de mesmo caminho (é assim que o build_instalador.py tira um mod: sem a pasta dele e com a lista e o menu refeitos).
// --so leva só o que começa com um dos caminhos (os pacotes opcionais: texturas HD, PBR, áudio do PS2, vídeos HD).
//
// A chave sai da chave do conteúdo que está no work.bin (NoNpDrm, +0x50) junto com o SHA-256 do PKG:
//   K = SHA-256("vitart-gow-instalador|" + chave16 + sha256_pkg)
// O instalador não guarda o hash do PKG: ele tem de calcular a partir do arquivo de quem instala. Ficam em claro só o
// content id, o tamanho do PKG e dois verificadores (um da licença, outro da chave final), para dizer qual dos dois
// está errado. Cada arquivo vai comprimido (quando vale a pena) e cifrado em AES-256-CTR com IV próprio; tudo é
// partido em blocos de 1,9 GB (gow-01.bin, gow-02.bin...), e o manifesto (cifrado) diz onde cada um começa.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { Transform, Writable } = require('stream');
const { pipeline } = require('stream/promises');

// a derivação da chave mora no motor do instalador: os dois lados usam o mesmo código
const M = require('../apps/instalador/motor.js');
const { CONTENT_ID, PKG_TAMANHO } = M;
const BLOCO = +process.env.VTPK_BLOCO || 1900 * 1024 * 1024; // VTPK_BLOCO só nos testes
// o que comprime bem; o resto (psarc, png, mp4, áudio ADPCM) já vem comprimido e vai como está
const COMPRIME = new Set(['.dll', '.exe', '.txt', '.ini', '.tsv', '.json', '.spv', '.dx11', '.gxp', '.wav', '.idx', '.js',
  '.css', '.html', '.md', '.py', '.pak', '.dat', '.vtpatch', '.bin_meta', '.sfo', '.xml', '.lldmap', '.cfg', '.ico']);

const ivDe = M.ivDe;
function chaves(rif, shaPkg) {
  const klic = M.lerLicenca(rif);
  const K = M.derivar(klic, shaPkg);
  return { K, verificaLicenca: M.verificaLicenca(klic), verificaChave: M.verificaChave(K) };
}

const vazias = []; // pastas sem nada dentro (o jogo espera algumas existirem, como data/mods)
function listar(raiz) {
  const out = [];
  (function andar(d) {
    const itens = fs.readdirSync(d, { withFileTypes: true });
    if (!itens.length && d !== raiz) vazias.push(path.relative(raiz, d).split(path.sep).join('/'));
    for (const e of itens) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) andar(p);
      else if (e.isFile()) out.push(p);
    }
  })(raiz);
  return out.sort();
}

// escreve num fluxo lógico único que se parte em blocos de BLOCO bytes
class Saida {
  constructor(dir) { this.dir = dir; this.parte = 0; this.noBloco = 0; this.total = 0; this.fd = null; this.tamanhos = []; }
  abrir() {
    this.parte++;
    this.fd = fs.openSync(path.join(this.dir, `gow-${String(this.parte).padStart(2, '0')}.bin`), 'w');
    this.noBloco = 0;
    this.tamanhos.push(0);
  }
  escrever(buf) {
    let o = 0;
    while (o < buf.length) {
      if (!this.fd || this.noBloco === BLOCO) { if (this.fd) fs.closeSync(this.fd); this.abrir(); }
      const n = Math.min(buf.length - o, BLOCO - this.noBloco);
      fs.writeSync(this.fd, buf, o, n);
      o += n; this.noBloco += n; this.total += n; this.tamanhos[this.tamanhos.length - 1] += n;
    }
  }
  fechar() { if (this.fd) fs.closeSync(this.fd); }
}

async function main() {
  const args = process.argv.slice(2);
  const [jogo, dados, rifPath, shaPkg] = args.filter(a => !a.startsWith('--'));
  const sem = args.filter(a => a.startsWith('--sem=')).map(a => a.slice(6));
  const so = args.filter(a => a.startsWith('--so=')).map(a => a.slice(5));
  const troca = args.find(a => a.startsWith('--troca='))?.slice(8);
  if (!shaPkg || !/^[0-9a-f]{64}$/i.test(shaPkg)) {
    console.error('uso: node tools/empacotar_instalador.js <pasta do jogo> <saída\\dados> <work.bin> <sha256 do PKG>');
    process.exit(2);
  }
  const { K, verificaLicenca, verificaChave } = chaves(fs.readFileSync(rifPath), shaPkg.toLowerCase());
  fs.mkdirSync(dados, { recursive: true });
  for (const f of fs.readdirSync(dados)) if (/^gow-\d+\.bin$|^manifesto\.bin$/.test(f)) fs.unlinkSync(path.join(dados, f)); // pacote anterior, gerado aqui

  const relDe = p => path.relative(jogo, p).split(path.sep).join('/');
  const arquivos = listar(jogo).map(p => ({ p, rel: relDe(p) }))
    .filter(a => !a.rel.startsWith('logs/') && !sem.some(c => a.rel.startsWith(c)) && (!so.length || so.some(c => a.rel.startsWith(c))))
    .map(a => troca && fs.existsSync(path.join(troca, a.rel)) ? { p: path.join(troca, a.rel), rel: a.rel, trocado: true } : a);
  for (let i = vazias.length - 1; i >= 0; i--)
    if (sem.some(c => (vazias[i] + '/').startsWith(c)) || (so.length && !so.some(c => (vazias[i] + '/').startsWith(c)))) vazias.splice(i, 1);
  if (sem.length || troca) console.log(`sem: ${sem.join(', ') || '-'}; trocados: ${arquivos.filter(a => a.trocado).map(a => a.rel).join(', ') || '-'}`);
  const totalOrig = arquivos.reduce((s, a) => s + fs.statSync(a.p).size, 0);
  console.log(`${arquivos.length} arquivos, ${(totalOrig / 1e9).toFixed(2)} GB`);
  const out = new Saida(dados);
  const lista = [];
  let feito = 0, t0 = Date.now(), ultimo = 0;
  for (const { p, rel } of arquivos) {
    const st = fs.statSync(p);
    const comprime = COMPRIME.has(path.extname(p).toLowerCase()) && st.size > 256;
    const h = crypto.createHash('sha256');
    const inicio = out.total;
    const etapas = [
      fs.createReadStream(p, { highWaterMark: 4 << 20 }),
      new Transform({ transform(c, _e, cb) { h.update(c); feito += c.length; cb(null, c); } }),
      ...(comprime ? [zlib.createDeflateRaw({ level: 6 })] : []),
      crypto.createCipheriv('aes-256-ctr', K, ivDe(K, rel)),
      new Writable({ write(c, _e, cb) { try { out.escrever(c); cb(); } catch (e) { cb(e); } } }),
    ];
    await pipeline(...etapas);
    const guardado = out.total - inicio;
    // comprimir piorou? (acontece pouco) fica assim mesmo: o instalador sabe pelo campo c
    lista.push({ p: rel, t: st.size, z: guardado, c: comprime ? 1 : 0, o: inicio, h: h.digest('hex'), m: Math.floor(st.mtimeMs) });
    if (Date.now() - ultimo > 2000) {
      ultimo = Date.now();
      const s = (Date.now() - t0) / 1000;
      console.log(`  ${(100 * feito / totalOrig).toFixed(1)}%  ${(feito / 1e9).toFixed(2)} GB  ${(feito / 1e6 / s).toFixed(0)} MB/s  ${rel}`);
    }
  }
  out.fechar();
  const manifesto = Buffer.from(JSON.stringify({ versao: 1, arquivos: lista, vazias, partes: out.tamanhos, bloco: BLOCO, original: totalOrig }));
  const mz = zlib.deflateRawSync(manifesto, { level: 9 });
  const mc = crypto.createCipheriv('aes-256-ctr', K, ivDe(K, 'manifesto'));
  const cab = {
    formato: 'vitart-gow-instalador', versao: 1, content_id: CONTENT_ID, pkg_tamanho: PKG_TAMANHO,
    verifica_licenca: verificaLicenca, verifica_chave: verificaChave,
    arquivos: lista.length, original: totalOrig, guardado: out.total, partes: out.tamanhos.length,
  };
  const cabBuf = Buffer.from(JSON.stringify(cab));
  const tam = Buffer.alloc(4);
  tam.writeUInt32LE(cabBuf.length);
  fs.writeFileSync(path.join(dados, 'manifesto.bin'), Buffer.concat([Buffer.from('VTPK1\n'), tam, cabBuf, mc.update(mz), mc.final()]));
  console.log(`pronto: ${lista.length} arquivos, ${(totalOrig / 1e9).toFixed(2)} GB -> ${(out.total / 1e9).toFixed(2)} GB em ${out.tamanhos.length} blocos (${((Date.now() - t0) / 60000).toFixed(1)} min)`);
}

module.exports = { chaves };
if (require.main === module) main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
