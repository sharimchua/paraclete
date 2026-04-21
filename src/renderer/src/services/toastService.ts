export const toast = {
  success: (message: string): void => {
    window.dispatchEvent(
      new CustomEvent('paraclete-toast', { detail: { message, type: 'success' } })
    )
  },
  error: (message: string): void => {
    window.dispatchEvent(new CustomEvent('paraclete-toast', { detail: { message, type: 'error' } }))
  },
  info: (message: string): void => {
    window.dispatchEvent(new CustomEvent('paraclete-toast', { detail: { message, type: 'info' } }))
  }
}
