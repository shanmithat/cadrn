import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const rootDir = process.cwd();
console.log('[Dev] Restoring index.html from index.source.html for Vite development...');
fs.copyFileSync(path.join(rootDir, 'index.source.html'), path.join(rootDir, 'index.html'));

const isWindows = process.platform === 'win32';
const viteCmd = isWindows ? 'npx.cmd' : 'npx';
const child = spawn(viteCmd, ['vite'], { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code || 0));
