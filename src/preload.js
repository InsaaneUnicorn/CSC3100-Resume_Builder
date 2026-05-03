const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('resumeCraft', {
  printResume: () => ipcRenderer.invoke('print-resume'),
});
