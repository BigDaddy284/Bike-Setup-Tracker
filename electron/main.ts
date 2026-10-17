import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const JSON_FILTER = { name: 'Bike Setup Tracker backup', extensions: ['json'] };

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 760,
    minHeight: 560,
    title: 'Bike Setup Tracker',
    backgroundColor: '#111827',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Track map links (target="_blank") open in the default browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) {
      e.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

ipcMain.handle('backup:open', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)!;
  const result = await dialog.showOpenDialog(win, {
    title: 'Import Bike Setup Tracker data',
    defaultPath: app.getPath('documents'),
    filters: [JSON_FILTER, { name: 'All files', extensions: ['*'] }],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return readFile(result.filePaths[0], 'utf8');
});

ipcMain.handle('backup:save', async (event, defaultFileName: string, contents: string) => {
  const win = BrowserWindow.fromWebContents(event.sender)!;
  const result = await dialog.showSaveDialog(win, {
    title: 'Export Bike Setup Tracker data',
    defaultPath: path.join(app.getPath('documents'), path.basename(defaultFileName)),
    filters: [JSON_FILTER],
  });
  if (result.canceled || !result.filePath) return null;
  await writeFile(result.filePath, contents, 'utf8');
  return result.filePath;
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
