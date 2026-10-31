// O que o instalador faz de verdade, sem tela: conferir o work.bin e o PKG, tirar a chave, ler o manifesto e extrair.
// O empacotador (tools/empacotar_instalador.js) usa as mesmas funções de chave, para os dois nunca divergirem.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const CONTENT_ID = 'UP9000-PCSA00126_00-GOWCUS030100SHIP';
const PKG_TAMANHO = 3336914560;

// ------------------------------------------------------------------ chaves
function lerLicenca(rif) {
  if (rif.length !== 512) throw new Error('O work.bin precisa ter 512 bytes (este tem ' + rif.length + ').');
  const cid = rif.subarray(0x10, 0x40).toString('latin1').replace(/\0.*$/s, '');
  if (cid !== CONTENT_ID) throw new Error(cid ? `Este work.bin é de outro jogo (${cid}).` : 'Isto não parece um work.bin.');
  return rif.subarray(0x50, 0x60); // chave do conteúdo (licença NoNpDrm)
}
const verificaLicenca = klic =>
  crypto.createHmac('sha256', crypto.createHash('sha256').update('rif|').update(klic).digest()).update('licenca').digest('hex');
const derivar = (klic, shaPkg) =>
  crypto.createHash('sha256').update('vitart-gow-instalador|').update(klic).update(Buffer.from(shaPkg, 'hex')).digest();
const verificaChave = K => crypto.createHmac('sha256', K).update('verifica').digest('hex');
const ivDe = (K, nome) => crypto.createHash('sha256').update(K).update('|iv|' + nome).digest().subarray(0, 16);

// ------------------------------------------------------------------ PKG
// confere o cabeçalho na hora (tamanho, "\x7FPKG", content id) e depois o SHA-256 do arquivo inteiro
function conferirCabecalhoPkg(p) {
  const st = fs.statSync(p);
  const fd = fs.openSync(p, 'r');
  const cab = Buffer.alloc(0x60);
  fs.readSync(fd, cab, 0, cab.length, 0);
  fs.closeSync(fd);
  if (cab.readUInt32BE(0) !== 0x7f504b47) throw new Error('Isto não é um PKG de PlayStation.');
  const cid = cab.subarray(0x30, 0x30 + 36).toString('latin1');
  if (cid !== CONTENT_ID) throw new Error(`Este PKG é de outro jogo ou região (${cid}). É preciso o PKG americano (PCSA00126).`);
  if (st.size !== PKG_TAMANHO) throw new Error(`O PKG tem ${st.size.toLocaleString('pt-BR')} bytes; o certo tem ${PKG_TAMANHO.toLocaleString('pt-BR')}. O arquivo está incompleto ou é outra versão.`);
  return st.size;
}
function hashPkg(p, aoAndar, cancelado = () => false) {
  return new Promise((ok, erro) => {
    const h = crypto.createHash('sha256');
    const total = fs.statSync(p).size;
    let feito = 0;
    const s = fs.createReadStream(p, { highWaterMark: 8 << 20 });
    s.on('data', c => {
      if (cancelado()) { s.destroy(); erro(new Error('cancelado')); return; }
      h.update(c); feito += c.length; aoAndar?.(feito, total);
    });
    s.on('end', () => ok(h.digest('hex')));
    s.on('error', erro);
  });
}

// ------------------------------------------------------------------ pacote
function lerCabecalho(dados) {
  const b = fs.readFileSync(path.join(dados, 'manifesto.bin'));
  if (b.subarray(0, 6).toString() !== 'VTPK1\n') throw new Error('Os dados do instalador estão faltando ou corrompidos (manifesto.bin).');
  const n = b.readUInt32LE(6);
  return { cab: JSON.parse(b.subarray(10, 10 + n).toString()), cifrado: b.subarray(10 + n) };
}
function lerManifesto(cifrado, K) {
  const d = crypto.createDecipheriv('aes-256-ctr', K, ivDe(K, 'manifesto'));
  return JSON.parse(zlib.inflateRawSync(Buffer.concat([d.update(cifrado), d.final()])).toString());
}

// lê n bytes a partir do deslocamento lógico o, atravessando os blocos gow-NN.bin
class Leitor {
  constructor(dados, man) { this.dados = dados; this.man = man; this.fds = new Map(); }
  fd(i) {
    if (!this.fds.has(i)) {
      const p = path.join(this.dados, `gow-${String(i + 1).padStart(2, '0')}.bin`);
      if (!fs.existsSync(p)) throw new Error(`Falta o arquivo de dados ${path.basename(p)}.`);
      this.fds.set(i, fs.openSync(p, 'r'));
    }
    return this.fds.get(i);
  }
  ler(o, n) {
    const buf = Buffer.allocUnsafe(n);
    let feito = 0;
    while (feito < n) {
      const i = Math.floor((o + feito) / this.man.bloco), off = (o + feito) % this.man.bloco;
      const k = Math.min(n - feito, this.man.bloco - off);
      const r = fs.readSync(this.fd(i), buf, feito, k, off);
      if (r <= 0) throw new Error('Arquivo de dados menor do que devia (cópia incompleta?).');
      feito += r;
    }
    return buf;
  }
  fechar() { for (const f of this.fds.values()) fs.closeSync(f); this.fds.clear(); }
}

// Extrai tudo em destino (ou só confere, com destino nulo). aoAndar(bytes, total, arquivo); cancelado() interrompe.
async function instalar(dados, man, K, destino, aoAndar, cancelado = () => false) {
  const L = new Leitor(dados, man);
  let feito = 0;
  const PEDACO = 4 << 20;
  try {
    for (const a of man.arquivos) {
      if (cancelado()) throw new Error('cancelado');
      const dec = crypto.createDecipheriv('aes-256-ctr', K, ivDe(K, a.p));
      const h = crypto.createHash('sha256');
      let fd = null;
      if (destino) {
        const alvo = path.join(destino, ...a.p.split('/'));
        fs.mkdirSync(path.dirname(alvo), { recursive: true });
        fd = fs.openSync(alvo, 'w');
      }
      const gravar = c => { h.update(c); if (fd !== null) fs.writeSync(fd, c); };
      const inf = a.c ? zlib.createInflateRaw() : null;
      const fim = inf ? new Promise((ok, erro) => { inf.on('data', gravar); inf.on('end', ok); inf.on('error', erro); }) : null;
      for (let o = 0; o < a.z; o += PEDACO) {
        const claro = dec.update(L.ler(a.o + o, Math.min(PEDACO, a.z - o)));
        if (inf) { if (!inf.write(claro)) await new Promise(r => inf.once('drain', r)); } else gravar(claro);
        if (!a.c) { feito += claro.length; aoAndar?.(feito, man.original, a.p); }
        if (o % (64 << 20) === 0) await new Promise(r => setImmediate(r)); // deixa a tela respirar
      }
      if (inf) { inf.end(); await fim; feito += a.t; aoAndar?.(feito, man.original, a.p); }
      if (fd !== null) {
        fs.closeSync(fd);
        const alvo = path.join(destino, ...a.p.split('/'));
        fs.utimesSync(alvo, new Date(a.m), new Date(a.m));
      }
      if (h.digest('hex') !== a.h) throw new Error(`Arquivo corrompido nos dados: ${a.p}`);
    }
    if (destino) for (const v of man.vazias || []) fs.mkdirSync(path.join(destino, ...v.split('/')), { recursive: true });
  } finally { L.fechar(); }
}

module.exports = { CONTENT_ID, PKG_TAMANHO, lerLicenca, verificaLicenca, derivar, verificaChave, ivDe, conferirCabecalhoPkg, hashPkg, lerCabecalho, lerManifesto, instalar };
