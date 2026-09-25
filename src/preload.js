const { contextBridge, ipcRenderer } = require('electron');
const { EditorState } = require('@codemirror/state');
const { EditorView } = require('@codemirror/view');
const { markdown } = require('@codemirror/lang-markdown');
const {
  livePreviewPlugin,
  markdownStylePlugin,
  editorTheme,
  mouseSelectingField,
  collapseOnSelectionFacet,
  setMouseSelecting,
} = require('codemirror-live-markdown');

const api = {
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  ping: () => ipcRenderer.invoke('ping')
};

contextBridge.exposeInMainWorld('electronAPI', api);
contextBridge.exposeInMainWorld('ElectronAPI', api);
contextBridge.exposeInMainWorld('markdownLibs', {
  EditorState,
  EditorView,
  markdown,
  livePreviewPlugin,
  markdownStylePlugin,
  editorTheme,
  mouseSelectingField,
  collapseOnSelectionFacet,
  setMouseSelecting,
});
