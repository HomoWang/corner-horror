const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('room307Desktop', {
  loadSave: () => ipcRenderer.invoke('room307:save:load'),
  writeSave: (value) => ipcRenderer.invoke('room307:save:write', value),
  clearSave: () => ipcRenderer.invoke('room307:save:clear'),
  closeGame: () => ipcRenderer.invoke('room307:app:close'),
});
