import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerSetupHandlers, PythonManager } from './setup/pythonManager'
import { BackendManager } from './backendManager'

let mainWindow: BrowserWindow
const backend = new BackendManager()

function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1350,
    height: 840,
    show: false,
    autoHideMenuBar: true,
    title: 'Paraclete',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Start the window
  createWindow()
  
  // Register setup handlers
  registerSetupHandlers(mainWindow)

  // Auto-start backend if setup is already done
  const python = new PythonManager()
  if (await python.isSetupComplete()) {
    backend.startBackend()
  }

  // Listener for setup completion to trigger backend start
  ipcMain.on('setup-complete', () => {
    backend.startBackend()
  })
})

app.on('window-all-closed', () => {
  backend.stopBackend()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
