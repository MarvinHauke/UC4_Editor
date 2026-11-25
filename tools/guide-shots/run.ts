// `npm run docs:shots`: starts the editor on port 5174 (GUIDE_SHOTS_PORT to change it; never 5173), runs every shot script, stops the server.
// A shot script is a file here that exports `run(browser)`; rig.ts, markers.ts and run.ts are not.
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BASE, PORT, launch } from './rig.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const here = fileURLToPath(new URL('./', import.meta.url));
const only = process.argv.slice(2);

// Something else on the port would be mistaken for the editor: if anything answers there, refuse.
const taken = await fetch(BASE).then(() => true, () => false);
if (taken) {
  console.error(`port ${PORT} is in use by another program. Free it or set GUIDE_SHOTS_PORT.`);
  process.exit(1);
}

const server = spawn(process.execPath, [fileURLToPath(new URL('../../node_modules/vite/bin/vite.js', import.meta.url)), '--port', String(PORT), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let serverExited = false;
server.on('exit', () => { serverExited = true; });
const stop = (): void => { server.kill(); };
process.on('exit', stop);
process.on('SIGINT', () => { stop(); process.exit(130); });

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (serverExited) throw new Error('the dev server stopped before it was ready (port taken?)');
    try { if ((await fetch(BASE)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('the dev server on the shot port did not start');
}

let failed = false;
try {
  await waitForServer();
  const browser = await launch();
  const scripts = readdirSync(here).filter((f) => f.endsWith('.ts') && !['rig.ts', 'markers.ts', 'run.ts'].includes(f)).sort();
  for (const file of scripts) {
    const mod = (await import(`./${file}`)) as { name: string; run: (b: typeof browser) => Promise<void> };
    if (only.length && !only.includes(mod.name)) continue;
    await mod.run(browser);
    console.log(`shot ${mod.name}`);
  }
  await browser.close();
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  stop();
}
process.exit(failed ? 1 : 0);
