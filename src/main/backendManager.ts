import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { app, dialog } from 'electron';
import fs from 'fs';

export class BackendManager {
    private process: ChildProcess | null = null;
    private pythonExe: string;

    constructor() {
        const userDataPath = app.getPath('userData');
        this.pythonExe = path.join(userDataPath, 'python_env', 'python.exe');
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

        // Phase 3 Hardening: Ensure the embeddable python can find our code and dependencies
        // Embeddable python ignores PYTHONPATH, so we must inject paths into the ._pth file
        const pythonDir = path.dirname(this.pythonExe);
        const pthFiles = fs.readdirSync(pythonDir).filter(f => f.endsWith('._pth'));
        if (pthFiles.length > 0) {
            const pthPath = path.join(pythonDir, pthFiles[0]);
            const appPath = app.getAppPath();
            
            // We need: zip, current dir, site-packages, app root, and 'import site'
            const pthContent = [
                pthFiles[0].replace('._pth', '.zip'),
                '.',
                'Lib/site-packages',
                appPath,
                'import site'
            ].join('\n');
            
            fs.writeFileSync(pthPath, pthContent);
        }

        const env = { 
            ...process.env, 
            PARACLETE_EXPOSE: exposeExternally ? '1' : '0',
            PARACLETE_MODEL_PATH: path.join(app.getPath('userData'), 'python_env', 'models', 'gemma-4-moe.gguf'),
            PYTHONPATH: [
                path.join(app.getPath('userData'), 'python_env', 'Lib', 'site-packages'),
                app.getAppPath()
            ].join(path.delimiter)
        };

        this.process = spawn(this.pythonExe, ['-m', 'backend.main'], { 
            env,
            cwd: app.getAppPath()
        });

        this.process.stdout?.on('data', (data) => console.log(`[BACKEND]: ${data.toString().trim()}`));
        this.process.stderr?.on('data', (data) => {
            const err = data.toString().trim();
            if (err) {
                console.error(`[BACKEND-ERR]: ${err}`);
            }
        });

        this.process.on('close', (code) => {
            console.log(`Backend process exited with code ${code}`);
            this.process = null;
        });
    }

    stopBackend(): void {
        if (this.process) {
            this.process.kill();
            this.process = null;
        }
    }
}
