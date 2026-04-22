if (typeof window !== 'undefined' && !window.electron) {
  console.warn('Electron API not found. Initialising mock ipcRenderer for browser environment.')

  window.electron = {
    ipcRenderer: {
      on: (channel: string, listener: (...args: unknown[]) => void) => {
        console.log(`[Mock ipcRenderer.on] ${channel}`)
        // Simulate setup completion delayed trigger
        if (channel === 'setup-status') {
          setTimeout(
            () => listener({} as unknown, { status: 'Mock Setup Complete', progress: 100 }),
            500
          )
        }
        if (channel === 'setup-complete') {
          setTimeout(() => listener({} as unknown, {}), 1000)
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
      removeAllListeners: () => window.electron.ipcRenderer
    } as unknown as typeof window.electron.ipcRenderer
  }
}
