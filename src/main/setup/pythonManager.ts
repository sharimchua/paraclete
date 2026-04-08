import { ipcMain, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { spawn } from 'child_process';

export class PythonManager {
    private setupPath: string;
    private isSettingUp: boolean = false;

    constructor() {
        // Path to store the standalone python environment
        this.setupPath = path.join(app.getPath('userData'), 'python_env');
    }

    async isSetupComplete(): Promise<boolean> {
        // Check if the python-env directory exists and has a sentinel file
        const sentinel = path.join(this.setupPath, '.setup_complete');
        return fs.existsSync(sentinel);
    }

    async startSetup(window: BrowserWindow): Promise<void> {
        if (this.isSettingUp) {
            console.log('Setup already in progress, ignoring duplicate call.');
            return;
        }
        this.isSettingUp = true;
        try {
            const sendStatus = (status: string, progress: number, log?: string) => {
                window.webContents.send('setup-status', { status, progress, log });
            };

            // In development, app.getAppPath() points to the project root
            const rootPath = app.getAppPath();
            const scriptPath = path.join(rootPath, 'scripts', 'setup_env.ps1');
            const requirementsPath = path.join(rootPath, 'backend', 'requirements.txt');

            console.log(`Running setup script at: ${scriptPath}`);

            // 1. Initialize
            sendStatus('Initializing setup...', 5, 'Launching PowerShell environment...');

            const child = spawn('powershell.exe', [
                '-ExecutionPolicy', 'Bypass',
                '-File', scriptPath,
                '-installPath', this.setupPath,
                '-requirementsFile', requirementsPath
            ]);

            child.stdout.on('data', (data) => {
                const lines = data.toString().split('\n');
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;

                    // Heuristics for progress bar mapping
                    let progress = -1; // -1 means don't change bar
                    if (trimmed.includes('Downloading Python')) progress = 20;
                    else if (trimmed.includes('Installing PIP')) progress = 35;
                    else if (trimmed.includes('Installing dependencies')) progress = 60;
                    else if (trimmed.includes('Verifying CUDA')) progress = 90;

                    // Update UI
                    window.webContents.send('setup-status', {
                        status: progress > 0 ? 'Updating Environment...' : 'Setting up...',
                        progress,
                        log: trimmed
                    });
                }
            });

            child.stderr.on('data', (data) => {
                const logLine = data.toString().trim();
                if (logLine) {
                    console.error(`PS Stderr: ${logLine}`);
                    // We don't necessarily treat stderr as failure since pip uses it for progress sometimes
                    window.webContents.send('setup-status', {
                        status: 'Setup Progress (Log)',
                        progress: -1,
                        log: logLine
                    });
                }
            });

            child.on('close', (code) => {
                this.isSettingUp = false;
                if (code === 0) {
                    fs.writeFileSync(path.join(this.setupPath, '.setup_complete'), new Date().toISOString());
                    window.webContents.send('setup-status', {
                        status: 'Setup complete',
                        progress: 100,
                        log: 'All systems ready'
                    });
                    
                    // Allow UI to breathe before signal
                    setTimeout(() => {
                        window.webContents.send('setup-complete');
                    }, 1500);
                } else {
                    window.webContents.send('setup-status', {
                         status: 'Setup Failed',
                         progress: 0,
                         log: `PowerShell process exited with code ${code}`
                    });
                }
            });

        } catch (error: any) {
            this.isSettingUp = false;
            window.webContents.send('setup-status', { 
                status: 'Error launching setup', 
                progress: 0, 
                log: `ERROR: ${error.message}` 
            });
        }
    }
}

export function registerSetupHandlers(mainWindow: BrowserWindow) {
    const manager = new PythonManager();

    ipcMain.handle('check-setup-status', async () => {
        return await manager.isSetupComplete();
    });

    ipcMain.on('start-setup', async () => {
        await manager.startSetup(mainWindow);
    });
}
