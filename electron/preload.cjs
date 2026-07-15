'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopSpirit', Object.freeze({
  getSettings: () => ipcRenderer.invoke('spirit:get-settings'),
  updateSettings: (patch) => ipcRenderer.invoke('spirit:update-settings', patch),
  moveWindowBy: (deltaX, deltaY) => ipcRenderer.invoke('spirit:move-window-by', deltaX, deltaY),
  setClickThrough: (enabled) => ipcRenderer.invoke('spirit:set-click-through', enabled),
  chat: (message) => ipcRenderer.invoke('spirit:chat', message),
  getCodexStatus: () => ipcRenderer.invoke('spirit:get-codex-status'),
  hide: () => ipcRenderer.invoke('spirit:hide'),
  openTrayMenu: () => ipcRenderer.invoke('spirit:open-tray-menu'),
  quit: () => ipcRenderer.invoke('spirit:quit'),
  onSettingsChanged: (callback) => {
    if (typeof callback !== 'function') throw new TypeError('Callback is required.');
    const listener = (_event, settings) => callback(settings);
    ipcRenderer.on('spirit:settings-changed', listener);
    return () => ipcRenderer.removeListener('spirit:settings-changed', listener);
  },
  onCodexProgress: (callback) => {
    if (typeof callback !== 'function') throw new TypeError('Callback is required.');
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('spirit:codex-progress', listener);
    return () => ipcRenderer.removeListener('spirit:codex-progress', listener);
  }
}));
