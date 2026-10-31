// O que a página do instalador enxerga.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('inst', {
  info: () => ipcRenderer.invoke('info'),
  escolher: tipo => ipcRenderer.invoke('escolher', tipo),
  licenca: p => ipcRenderer.invoke('licenca', p),
  pkg: p => ipcRenderer.invoke('pkg', p),
  chave: () => ipcRenderer.invoke('chave'),
  espaco: dir => ipcRenderer.invoke('espaco', dir),
  instalar: (dir, op) => ipcRenderer.invoke('instalar', dir, op),
  cancelar: () => ipcRenderer.invoke('cancelar'),
  jogar: () => ipcRenderer.invoke('jogar'),
  abrirPasta: () => ipcRenderer.invoke('abrir-pasta'),
  aoPkg: fn => ipcRenderer.on('pkg-andar', (_e, v) => fn(v)),
  aoInstalar: fn => ipcRenderer.on('instalar-andar', (_e, v) => fn(v)),
  janela: a => ipcRenderer.send('janela', a),
});
