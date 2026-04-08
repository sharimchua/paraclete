import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { app, dialog } from 'electron';
import fs from 'fs';

export class BackendManager {
    private process: ChildProcess | null = null;
    private pythonExe: string;
    private backendFile: string;

    constructor() {
        const userDataPath = app.getPath('userData');
        this.pythonExe = path.join(userDataPath, 'python_env', 'python.exe');
        this.backendFile = path.join(app.getAppPath(), 'backend', 'main.py');
    }

    startBackend(exposeExternally: boolean = false): void {
        console.log(`>>> Starting Paraclete Backend (External: ${exposeExternally})`);
        
        if (!fs.existsSync(this.pythonExe)) {
            console.error(`FATAL: Python environment missing at ${this.pythonExe}`);
            dialog.showErrorBox('Backend Setup Missing', 'The Python environment was not found. Please complete the setup.');
            return;
        }

        if (this.process) {
            this.stopBackend();
        }

        const env = { 
            ...process.env, 
            PARACLETE_EXPOSE: exposeExternally ? '1' : '0' 
        };

        this.process = spawn(this.pythonExe, [this.backendFile], { env });

        this.process.stdout?.on('data', (data) => console.log(`[BACKEND]: ${data.toString().trim()}`));
        this.process.stderr?.on('data', (data) => {
            const err = data.toString().trim();
            if (err) console.error(`[BACKEND-ERR]: ${err}`);
        });

        this.process.on('close', (code) => {
            console.log(`Backend process exited with code ${code}`);
            this.process = null;
        });

        console.log('Backend spawned.');
    }

    stopBackend(): void {
        if (this.process) {
            this.process.kill();
            this.process = null;
            console.log('Backend stopped.');
        }
    }
}
