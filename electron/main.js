const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

Menu.setApplicationMenu(null);

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'img', 'icon.ico'),
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: false
    }
  });

  win.loadFile('index.html');
}

app.whenReady().then(createWindow);
