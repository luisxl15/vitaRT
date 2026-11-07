// vitart Troféus, vitart Mod Studio e vitart Settings: o mesmo código, três programas. Qual abre sai do --app= ou do
// nome do exe ("vitart Mod Studio.exe" abre o Mod Studio, "vitart Settings.exe" o Settings). O trabalho de verdade fica no Python do repositório
// (tools/vitart_ponte.py), que roda como processo filho e fala JSON por linha.
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const argApp = (process.argv.find(a => a.startsWith('--app=')) || '').slice(6);
const exeName = path.basename(app.getPath('exe')).toLowerCase();
const QUAL = argApp || (exeName.includes('mod') ? 'modstudio' : exeName.includes('setting') ? 'settings' : 'trofeus');
const TITULO = { modstudio: 'vitart Mod Studio', settings: 'vitart Settings' }[QUAL] || 'vitart Troféus';
const TELA = { modstudio: [1320, 860, 'modstudio.html'], settings: [1180, 800, 'settings.html'] }[QUAL] || [1360, 880, 'trofeus.html'];

// onde está o repositório: VITART_REPO, o repo.json gravado no empacotamento, ou duas pastas acima (desenvolvimento)
function acharRepo() {
  if (process.env.VITART_REPO) return process.env.VITART_REPO;
  try {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, 'repo.json'), 'utf8'));
    // no jogo instalado o caminho é relativo ao exe (Ferramentasitart-ui -> Ferramentas)
    const r = j.relativo ? path.resolve(path.dirname(app.getPath('exe')), j.relativo) : j.repo;
    if (r && fs.existsSync(path.join(r, 'tools', 'vitart_ponte.py'))) return r;
  } catch (_) { /* sem repo.json: modo de desenvolvimento */ }
  return path.resolve(__dirname, '..', '..');
}
const REPO = acharRepo();

// ------------------------------------------------------------------ ponte com o Python
let ponte = null;
let fila = new Map();
let seq = 0;
let resto = '';
let janela = null;

function iniciarPonte() {
  // o jogo instalado traz um Python próprio em Ferramentas\python (tools/python_portatil.py): não depende do PC ter
  // Python. -E -s: nem PYTHONPATH/PYTHONHOME nem os pacotes do usuário de um Python instalado se metem.
  const portatil = path.join(REPO, 'python', 'python.exe');
  const temPortatil = !process.env.VITART_PYTHON && fs.existsSync(portatil);
  const py = process.env.VITART_PYTHON || (temPortatil ? portatil : 'python');
  const args = (temPortatil ? ['-E', '-s'] : []).concat(['-P', path.join(REPO, 'tools', 'vitart_ponte.py')]);
  ponte = spawn(py, args, {
    cwd: path.join(REPO, 'tools'),
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' },
    windowsHide: true,
  });
  ponte.stdout.setEncoding('utf8');
  ponte.stdout.on('data', chunk => {
    resto += chunk;
    let i;
    while ((i = resto.indexOf('\n')) >= 0) {
      const linha = resto.slice(0, i).trim();
      resto = resto.slice(i + 1);
      if (!linha) continue;
      let msg;
      try { msg = JSON.parse(linha); } catch (_) { continue; }
      if (msg.ev) {
        if (janela && !janela.isDestroyed()) janela.webContents.send('ponte-ev', msg);
      } else if (fila.has(msg.id)) {
        const { ok, erro } = fila.get(msg.id);
        fila.delete(msg.id);
        msg.ok ? ok(msg.r) : erro(new Error(msg.erro));
      }
    }
  });
  ponte.stderr.on('data', d => process.stderr.write(d));
  ponte.on('exit', code => {
    for (const { erro } of fila.values()) erro(new Error('a ponte do Python fechou (código ' + code + ')'));
    fila.clear();
    if (janela && !janela.isDestroyed()) janela.webContents.send('ponte-ev', { ev: 'caiu', code });
  });
  ponte.on('error', e => {
    if (janela && !janela.isDestroyed()) janela.webContents.send('ponte-ev', { ev: 'caiu', erro: String(e) });
  });
}

function chamar(m, a) {
  return new Promise((ok, erro) => {
    if (!ponte || ponte.exitCode !== null) return erro(new Error('Python não está rodando'));
    const id = ++seq;
    fila.set(id, { ok, erro });
    ponte.stdin.write(JSON.stringify({ id, m, a: a || {} }) + '\n');
  });
}

ipcMain.handle('rpc', async (_e, m, a) => {
  try { return { ok: true, r: await chamar(m, a) }; } catch (e) { return { ok: false, erro: e.message }; }
});
ipcMain.handle('url-de', (_e, p) => (p ? pathToFileURL(p).href : null));
ipcMain.handle('info', () => ({ qual: QUAL, titulo: TITULO, repo: REPO }));

// diálogos do sistema
ipcMain.handle('abrir-arquivo', async (_e, filtros) => {
  const r = await dialog.showOpenDialog(janela, { properties: ['openFile'], filters: filtros || [] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('salvar-arquivo', async (_e, nome, filtros) => {
  const r = await dialog.showSaveDialog(janela, { defaultPath: nome, filters: filtros || [] });
  return r.canceled ? null : r.filePath;
});
ipcMain.handle('escolher-pasta', async () => {
  const r = await dialog.showOpenDialog(janela, { properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('abrir-link', (_e, url) => shell.openExternal(url));

// ------------------------------------------------------------------ atualizações (Settings)
// a pasta do jogo instalado é a de cima de Ferramentas; em desenvolvimento, VITART_JOGO
const JOGO = process.env.VITART_JOGO || path.dirname(REPO);
let AT = null;
const at = () => (AT ||= require('./atualizador.js'));
const evento = msg => { if (janela && !janela.isDestroyed()) janela.webContents.send('ponte-ev', msg); };
ipcMain.handle('atualizacao', async (_e, acao, dados) => {
  try {
    if (acao === 'verificar') return { ok: true, r: await at().verificar(JOGO) };
    if (acao === 'instalar') {
      let ultimo = 0;
      const r = await at().instalarPacote(JOGO, dados.pacote, (etapa, feito, total) => {
        if (Date.now() - ultimo < 120 && feito < total) return;
        ultimo = Date.now();
        evento({ ev: 'atualizacao', pacote: dados.pacote.nome, etapa, feito, total });
      }, dados.tag);
      return { ok: true, r };
    }
    if (acao === 'chave') {
      const rif = await dialog.showOpenDialog(janela, { title: 'work.bin da sua licença', properties: ['openFile'],
        filters: [{ name: 'work.bin', extensions: ['bin', 'rif'] }] });
      if (rif.canceled) return { ok: false, erro: 'cancelado' };
      const pkg = await dialog.showOpenDialog(janela, { title: 'PKG americano do jogo (PCSA00126)', properties: ['openFile'],
        filters: [{ name: 'PKG', extensions: ['pkg'] }] });
      if (pkg.canceled) return { ok: false, erro: 'cancelado' };
      await at().chaveDosArquivos(JOGO, rif.filePaths[0], pkg.filePaths[0], (f, t) => evento({ ev: 'atualizacao', etapa: 'chave', feito: f, total: t }));
      return { ok: true, r: true };
    }
    return { ok: false, erro: 'ação desconhecida' };
  } catch (e) { return { ok: false, erro: e.message, codigo: e.codigo }; }
});

// botões da barra de título (a janela não tem moldura do Windows)
ipcMain.on('janela', (_e, acao) => {
  if (!janela) return;
  if (acao === 'min') janela.minimize();
  else if (acao === 'max') janela.isMaximized() ? janela.unmaximize() : janela.maximize();
  else if (acao === 'fechar') janela.close();
});

function criarJanela() {
  janela = new BrowserWindow({
    width: TELA[0],
    height: TELA[1],
    minWidth: 1060,
    minHeight: 680,
    frame: false,
    backgroundColor: '#0b0807',
    title: TITULO,
    show: false,
    icon: fs.existsSync(path.join(__dirname, 'vitart.ico')) ? path.join(__dirname, 'vitart.ico') : undefined,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false, backgroundThrottling: !process.env.VITART_UI_CAPTURA },
  });
  janela.setMenu(null);
  janela.loadFile(path.join(__dirname, 'renderer', TELA[2]));
  janela.once('ready-to-show', () => janela.show());
  // VITART_UI_CAPTURA=<arquivo.png>: fotografa a própria janela depois de uns segundos e fecha (conferir o visual
  // sem tirar print da área de trabalho). VITART_UI_JS roda um trecho antes, para abrir uma aba, por exemplo.
  if (process.env.VITART_UI_CAPTURA) {
    janela.webContents.on('console-message', (_e, nivel, msg, linha, fonte) =>
      process.stdout.write(`[página ${nivel}] ${msg} (${path.basename(fonte || '')}:${linha})\n`));
    janela.webContents.once('did-finish-load', () => setTimeout(async () => {
      if (process.env.VITART_UI_JS) await janela.webContents.executeJavaScript(process.env.VITART_UI_JS).catch(() => {});
      setTimeout(async () => {
        const img = await janela.webContents.capturePage();
        fs.writeFileSync(process.env.VITART_UI_CAPTURA, img.toPNG());
        app.quit();
      }, +(process.env.VITART_UI_ESPERA2 || 1800));
    }, +(process.env.VITART_UI_ESPERA || 3500)));
  }
  janela.on('maximize', () => janela.webContents.send('maximizada', true));
  janela.on('unmaximize', () => janela.webContents.send('maximizada', false));
  // links do guia abrem no navegador, não dentro do app
  janela.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

app.setAppUserModelId('vitart.' + QUAL);
// na captura a janela costuma ficar atrás de outras; sem isto o Chromium para de desenhar e a foto sai velha
if (process.env.VITART_UI_CAPTURA) app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.whenReady().then(() => {
  iniciarPonte();
  criarJanela();
});
app.on('window-all-closed', () => {
  if (ponte) ponte.kill();
  app.quit();
});
