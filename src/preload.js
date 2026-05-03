
// Preload script: runs in Electron's isolated context before renderer loads
// Purpose: Securely expose limited APIs from Electron main process to renderer (browser) context
// This is required because nodeIntegration is off and contextIsolation is on for security

const { contextBridge, ipcRenderer } = require('electron');

// Expose a safe API to the renderer (window.resumeCraft)
// Only allows printing the resume (calls main process via IPC)
contextBridge.exposeInMainWorld('resumeCraft', {
  // printResume is called from render.js when user clicks Print
  // This sends an IPC message to Electron main (index.js) to trigger printing
  printResume: () => ipcRenderer.invoke('print-resume'),
});
