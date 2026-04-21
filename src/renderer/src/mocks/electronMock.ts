import { ElectronAPI } from '@electron-toolkit/preload'

if (typeof window !== 'undefined' && !window.electron) {
  console.warn('Electron API not found. Initialising mock ipcRenderer for browser environment.')

  window.electron = {
    webFrame: {} as ElectronAPI['webFrame'],
    webUtils: {} as ElectronAPI['webUtils'],
    process: {} as ElectronAPI['process'],
    ipcRenderer: {
      on: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => {
        console.log(`[Mock ipcRenderer.on] ${channel}`)
        if (channel === 'setup-status') {
          setTimeout(
            () =>
              listener({} as unknown, { status: 'Mock Setup Complete', progress: 100 } as unknown),
            500
          )
        }
        if (channel === 'setup-complete') {
          setTimeout(() => listener({} as unknown, {} as unknown), 1000)
        }
        return window.electron.ipcRenderer
      },
      send: (channel: string, ...args: unknown[]) => {
        console.log(`[Mock ipcRenderer.send] ${channel}`, args)
      },
      invoke: async (channel: string, ...args: unknown[]) => {
        console.log(`[Mock ipcRenderer.invoke] ${channel}`, args)
        if (channel === 'check-setup-status') {
          return true
        }
        return null
      },
      removeAllListeners: (channel: string) => {
        console.log(`[Mock ipcRenderer.removeAllListeners] ${channel}`)
        return window.electron.ipcRenderer
      }
    } as ElectronAPI['ipcRenderer']
  }
}
