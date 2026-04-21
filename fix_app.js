const fs = require('fs')
let content = fs.readFileSync('src/renderer/src/App.tsx', 'utf-8')

// Replace `const fetchProposalsCount = async () => {` with `const fetchProposalsCount = async (): Promise<void> => {`
content = content.replace(
  'const fetchProposalsCount = async () => {',
  'const fetchProposalsCount = async (): Promise<void> => {'
)

// Replace `const handleLinkPersona = (e: any) => {`
content = content.replace(
  'const handleLinkPersona = (e: any) => {',
  'const handleLinkPersona = (e: CustomEvent): void => {'
)

// Replace `const handleNavigate = (e: any) => {`
content = content.replace(
  'const handleNavigate = (e: any) => {',
  'const handleNavigate = (e: CustomEvent): void => {'
)

// Replace `const handleTriggerMessageModal = () => setShowContactSelection(true)`
content = content.replace(
  'const handleTriggerMessageModal = () => setShowContactSelection(true)',
  'const handleTriggerMessageModal = (): void => setShowContactSelection(true)'
)

// Replace `const handleThinking = (e: any) => setIsThinking(e.detail)`
content = content.replace(
  'const handleThinking = (e: any) => setIsThinking(e.detail)',
  'const handleThinking = (e: CustomEvent): void => setIsThinking(e.detail)'
)

// Replace `window.addEventListener('trigger-link-persona' as any, handleLinkPersona)`
content = content.replace(
  "window.addEventListener('trigger-link-persona' as any, handleLinkPersona)",
  "window.addEventListener('trigger-link-persona' as EventListener, handleLinkPersona as EventListener)"
)

// Replace `window.addEventListener('navigate' as any, handleNavigate)`
content = content.replace(
  "window.addEventListener('navigate' as any, handleNavigate)",
  "window.addEventListener('navigate' as EventListener, handleNavigate as EventListener)"
)

// Replace `window.addEventListener('trigger-message-modal' as any, handleTriggerMessageModal)`
content = content.replace(
  "window.addEventListener('trigger-message-modal' as any, handleTriggerMessageModal)",
  "window.addEventListener('trigger-message-modal' as EventListener, handleTriggerMessageModal as EventListener)"
)

// Replace `window.addEventListener('paraclete-thinking' as any, handleThinking)`
content = content.replace(
  "window.addEventListener('paraclete-thinking' as any, handleThinking)",
  "window.addEventListener('paraclete-thinking' as EventListener, handleThinking as EventListener)"
)

fs.writeFileSync('src/renderer/src/App.tsx', content)

let pyManager = fs.readFileSync('src/main/setup/pythonManager.ts', 'utf-8')
pyManager = pyManager.replace(
  'const sendStatus = (status: string, progress: number, log?: string) => {',
  'const sendStatus = (status: string, progress: number, log?: string): void => {'
)
pyManager = pyManager.replace('} catch (error: any) {', '} catch (error: unknown) {')
pyManager = pyManager.replace(
  'log: `ERROR: ${error.message}`',
  'log: `ERROR: ${(error as Error).message}`'
)
pyManager = pyManager.replace(
  'export function registerSetupHandlers(mainWindow: BrowserWindow) {',
  'export function registerSetupHandlers(_mainWindow: BrowserWindow): void {'
)
fs.writeFileSync('src/main/setup/pythonManager.ts', pyManager)
