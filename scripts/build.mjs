import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const rootDir = process.cwd();

console.log('[Build] Step 1: Restoring index.html from index.source.html for Vite compilation...');
fs.copyFileSync(path.join(rootDir, 'index.source.html'), path.join(rootDir, 'index.html'));

console.log('[Build] Step 2: Running TypeScript typecheck and Vite build...');
execSync('npx tsc && npx vite build', { stdio: 'inherit' });

console.log('[Build] Step 3: Copying production artifacts to root / and docs/ for GitHub Pages...');
const distDir = path.join(rootDir, 'dist');
const docsDir = path.join(rootDir, 'docs');

if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Copy dist files to docs/
copyDirRecursive(distDir, docsDir);

// Copy dist files directly to root /
fs.copyFileSync(path.join(distDir, 'index.html'), path.join(rootDir, 'index.html'));
fs.copyFileSync(path.join(distDir, 'coi-serviceworker.js'), path.join(rootDir, 'coi-serviceworker.js'));
if (fs.existsSync(path.join(distDir, '.nojekyll'))) {
  fs.copyFileSync(path.join(distDir, '.nojekyll'), path.join(rootDir, '.nojekyll'));
} else {
  fs.writeFileSync(path.join(rootDir, '.nojekyll'), '');
}

copyDirRecursive(path.join(distDir, 'assets'), path.join(rootDir, 'assets'));
copyDirRecursive(path.join(distDir, 'models'), path.join(rootDir, 'models'));

console.log('[Build] Successfully built and placed production website directly into / (root)!');
