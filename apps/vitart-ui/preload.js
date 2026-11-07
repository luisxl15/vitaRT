// O que a página enxerga do Electron: chamadas à ponte, diálogos e a janela. Nada além disso.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vt', {
  rpc: async (m, a) => {
    const r = await ipcRenderer.invoke('rpc', m, a);
    if (!r.ok) throw new Error(r.erro);
    return r.r;
  },
  aoEvento: fn => ipcRenderer.on('ponte-ev', (_e, msg) => fn(msg)),
  aoMaximizar: fn => ipcRenderer.on('maximizada', (_e, v) => fn(v)),
  urlDe: p => ipcRenderer.invoke('url-de', p),
  info: () => ipcRenderer.invoke('info'),
  abrirArquivo: filtros => ipcRenderer.invoke('abrir-arquivo', filtros),
  salvarArquivo: (nome, filtros) => ipcRenderer.invoke('salvar-arquivo', nome, filtros),
  escolherPasta: () => ipcRenderer.invoke('escolher-pasta'),
  abrirLink: url => ipcRenderer.invoke('abrir-link', url),
  atualizacao: async (acao, dados) => {
    const r = await ipcRenderer.invoke('atualizacao', acao, dados);
    if (!r.ok) throw Object.assign(new Error(r.erro), { codigo: r.codigo });
    return r.r;
  },
  janela: acao => ipcRenderer.send('janela', acao),
});
