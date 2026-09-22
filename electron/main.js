const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

Menu.setApplicationMenu(null);

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'img', 'icon.ico'),
    backgroundColor: '#0D1F3A',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0D1F3A',
      symbolColor: '#ffffff',
      height: 34
    },
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: false
    }
  });

  win.loadFile('loading.html');
}

app.whenReady().then(createWindow);
