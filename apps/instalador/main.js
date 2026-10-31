// Instalador do God of War Collection: confere o PKG USA e o work.bin, tira deles a chave dos dados e extrai o jogo.
// Os dados ficam em ..\..\dados (ao lado da pasta "instalador"), em blocos cifrados feitos pelo
// tools/empacotar_instalador.js. VITART_INST_TESTE=1 não cria atalhos nem mexe no registro.
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const M = require('./motor.js');

const TESTE = !!process.env.VITART_INST_TESTE;
const NOME = 'God of War Collection';
const EXE = NOME + '.exe';
const CHAVE_REG = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\GodOfWarCollection-vitart';

// pasta dos dados: VITART_INST_DADOS, ou <raiz do instalador>\dados (o exe fica em <raiz>\instalador)
const DADOS = process.env.VITART_INST_DADOS || path.resolve(path.dirname(app.getPath('exe')), '..', 'dados');

let janela = null;
const est = { cab: null, cifrado: null, klic: null, K: null, man: null, cancelar: false, instalando: false, destino: null };
const enviar = (canal, v) => janela && !janela.isDestroyed() && janela.webContents.send(canal, v);

ipcMain.handle('info', () => {
  try {
    const { cab, cifrado } = M.lerCabecalho(DADOS);
    est.cab = cab; est.cifrado = cifrado;
    return { ok: true, cab, teste: TESTE, padrao: path.join(process.env.SystemDrive || 'C:', path.sep, 'Jogos', NOME) };
  } catch (e) { return { ok: false, erro: e.message, dados: DADOS }; }
});

ipcMain.handle('escolher', async (_e, tipo) => {
  if (tipo === 'pasta') {
    const r = await dialog.showOpenDialog(janela, { properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  }
  const filtros = tipo === 'pkg' ? [{ name: 'PKG do PS Vita', extensions: ['pkg'] }] : [{ name: 'Licença (work.bin)', extensions: ['bin', 'rif'] }];
  const r = await dialog.showOpenDialog(janela, { properties: ['openFile'], filters: [...filtros, { name: 'Todos', extensions: ['*'] }] });
  return r.canceled ? null : r.filePaths[0];
});

// a licença: content id certo e o verificador do pacote batendo
ipcMain.handle('licenca', (_e, p) => {
  try {
    const klic = M.lerLicenca(fs.readFileSync(p));
    if (M.verificaLicenca(klic) !== est.cab.verifica_licenca) throw new Error('Este work.bin não é a licença deste jogo.');
    est.klic = klic;
    return { ok: true };
  } catch (e) { est.klic = null; return { ok: false, erro: e.message }; }
});

// o PKG: cabeçalho na hora, depois o SHA-256 inteiro; com a licença em mãos, sai a chave e o manifesto
let hashando = false;
ipcMain.handle('pkg', async (_e, p) => {
  try {
    M.conferirCabecalhoPkg(p);
    hashando = true; est.cancelar = false;
    let ultimo = 0;
    const sha = await M.hashPkg(p, (f, t) => { if (Date.now() - ultimo > 80 || f === t) { ultimo = Date.now(); enviar('pkg-andar', f / t); } }, () => est.cancelar);
    hashando = false;
    est.sha = sha;
    return { ok: true };
  } catch (e) { hashando = false; est.sha = null; return { ok: false, erro: e.message }; }
});

ipcMain.handle('chave', () => {
  if (!est.klic || !est.sha) return { ok: false, erro: 'Falta o PKG ou o work.bin.' };
  const K = M.derivar(est.klic, est.sha);
  if (M.verificaChave(K) !== est.cab.verifica_chave) return { ok: false, erro: 'O PKG não é a versão que este instalador espera (o arquivo foi modificado ou está corrompido).' };
  est.K = K;
  est.man = M.lerManifesto(est.cifrado, K);
  return { ok: true, arquivos: est.man.arquivos.length, total: est.man.original };
});

ipcMain.handle('espaco', (_e, dir) => {
  try {
    let raiz = path.parse(path.resolve(dir)).root;
    const s = fs.statfsSync(raiz);
    return { livre: s.bavail * s.bsize, precisa: est.cab.original, raiz };
  } catch (e) { return { erro: e.message }; }
});

// depois de extrair: desinstalador, atalhos e a entrada em "Programas e Recursos"
function posInstalacao(destino, opcoes) {
  const exe = path.join(destino, EXE);
  const atalhos = [];
  if (!TESTE && opcoes.desktop) atalhos.push(path.join(app.getPath('desktop'), NOME + '.lnk'));
  if (!TESTE && opcoes.menu) atalhos.push(path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', NOME + '.lnk'));
  for (const a of atalhos)
    shell.writeShortcutLink(a, 'create', { target: exe, cwd: destino, icon: exe, iconIndex: 0, description: NOME });
  const reg = !TESTE && opcoes.registro;
  // o .cmd se copia para o %TEMP% antes de apagar a pasta onde está
  const linhas = [
    '@echo off', 'chcp 65001 >nul',
    'if /i not "%~1"=="--temp" (', '  copy /y "%~f0" "%TEMP%\\gow_desinstalar.cmd" >nul', '  start "" cmd /c ""%TEMP%\\gow_desinstalar.cmd" --temp"', '  exit /b', ')',
    `title Desinstalar ${NOME}`,
    `echo Isto remove o ${NOME} de:`, `echo   ${destino}`, 'echo Os saves e troféus ficam em data\\ e também serão removidos.', 'echo.',
    'choice /c SN /m "Continuar"', 'if errorlevel 2 exit /b',
    ...atalhos.map(a => `del /q "${a}" 2>nul`),
    ...(reg ? [`reg delete "${CHAVE_REG}" /f >nul 2>nul`] : []),
    `rd /s /q "${destino}"`, `echo ${NOME} removido.`, 'pause',
  ];
  fs.writeFileSync(path.join(destino, 'Desinstalar.cmd'), linhas.join('\r\n') + '\r\n', 'utf8');
  if (reg) {
    const add = (nome, tipo, valor) => execFileSync('reg', ['add', CHAVE_REG, '/v', nome, '/t', tipo, '/d', String(valor), '/f'], { windowsHide: true });
    add('DisplayName', 'REG_SZ', NOME);
    add('DisplayIcon', 'REG_SZ', exe);
    add('DisplayVersion', 'REG_SZ', '1.0');
    add('Publisher', 'REG_SZ', 'vitart (recompilação não oficial)');
    add('InstallLocation', 'REG_SZ', destino);
    add('UninstallString', 'REG_SZ', `"${path.join(destino, 'Desinstalar.cmd')}"`);
    add('EstimatedSize', 'REG_DWORD', Math.round(est.man.original / 1024));
    add('NoModify', 'REG_DWORD', 1);
    add('NoRepair', 'REG_DWORD', 1);
  }
}

ipcMain.handle('instalar', async (_e, destino, opcoes) => {
  if (!est.K || !est.man) return { ok: false, erro: 'A licença ainda não foi conferida.' };
  est.cancelar = false; est.instalando = true; est.destino = destino;
  const t0 = Date.now();
  let ultimo = 0;
  try {
    fs.mkdirSync(destino, { recursive: true });
    await M.instalar(DADOS, est.man, est.K, destino, (feito, total, arq) => {
      if (Date.now() - ultimo < 100 && feito < total) return;
      ultimo = Date.now();
      enviar('instalar-andar', { feito, total, arq, seg: (Date.now() - t0) / 1000 });
    }, () => est.cancelar);
    posInstalacao(destino, opcoes);
    est.instalando = false;
    return { ok: true, seg: (Date.now() - t0) / 1000 };
  } catch (e) { est.instalando = false; return { ok: false, erro: e.message, cancelado: e.message === 'cancelado' }; }
});

ipcMain.handle('cancelar', () => { est.cancelar = true; return true; });
ipcMain.handle('jogar', () => {
  const exe = path.join(est.destino, EXE);
  spawn(exe, [], { cwd: est.destino, detached: true, stdio: 'ignore' }).unref();
  setTimeout(() => app.quit(), 500);
});
ipcMain.handle('abrir-pasta', () => shell.openPath(est.destino));
ipcMain.on('janela', async (_e, acao) => {
  if (!janela) return;
  if (acao === 'min') janela.minimize();
  else if (acao === 'fechar') {
    if (est.instalando || hashando) {
      const r = await dialog.showMessageBox(janela, { type: 'warning', buttons: ['Continuar instalando', 'Sair mesmo assim'], defaultId: 0, cancelId: 0,
        title: NOME, message: 'A instalação ainda está em andamento.', detail: 'Se sair agora, a pasta fica incompleta e o jogo não abre.' });
      if (r.response !== 1) return;
      est.cancelar = true;
    }
    janela.close();
  }
});

function criarJanela() {
  janela = new BrowserWindow({
    width: 1100, height: 660, resizable: false, maximizable: false, frame: false, backgroundColor: '#0b0807', show: false,
    title: 'Instalar ' + NOME,
    icon: fs.existsSync(path.join(__dirname, 'icone.ico')) ? path.join(__dirname, 'icone.ico') : undefined,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, backgroundThrottling: !process.env.VITART_UI_CAPTURA },
  });
  janela.setMenu(null);
  janela.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  janela.once('ready-to-show', () => janela.show());
  // VITART_UI_CAPTURA=<png>: foto da própria janela (VITART_UI_JS roda antes), como nos outros apps do vitart
  if (process.env.VITART_UI_CAPTURA) {
    janela.webContents.on('console-message', (_e, n, m, l) => process.stdout.write(`[página ${n}] ${m} (${l})\n`));
    janela.webContents.once('did-finish-load', () => setTimeout(async () => {
      if (process.env.VITART_UI_JS) await janela.webContents.executeJavaScript(process.env.VITART_UI_JS).catch(e => console.log(e));
      setTimeout(async () => {
        fs.writeFileSync(process.env.VITART_UI_CAPTURA, (await janela.webContents.capturePage()).toPNG());
        app.quit();
      }, +(process.env.VITART_UI_ESPERA2 || 1500));
    }, +(process.env.VITART_UI_ESPERA || 2000)));
  }
}

if (process.env.VITART_UI_CAPTURA) app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.setAppUserModelId('vitart.instalador');
app.whenReady().then(criarJanela);
app.on('window-all-closed', () => app.quit());
