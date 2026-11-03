const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("veritas", {
  platform: process.platform,
  call: (action, payload) =>
    ipcRenderer.invoke("veritas:call", action, payload),
  onRoomProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("veritas:room-progress", listener);
    return () => ipcRenderer.removeListener("veritas:room-progress", listener);
  },
  subscribe: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("veritas:state", listener);
    return () => ipcRenderer.removeListener("veritas:state", listener);
  },
});
