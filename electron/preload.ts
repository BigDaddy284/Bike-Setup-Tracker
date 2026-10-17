import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('desktop', {
  openBackup: (): Promise<string | null> => ipcRenderer.invoke('backup:open'),
  saveBackup: (defaultFileName: string, contents: string): Promise<string | null> =>
    ipcRenderer.invoke('backup:save', defaultFileName, contents),
});
