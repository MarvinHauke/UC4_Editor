// `npm run pages` (plan 0011): joins the two separate builds into the one GitHub Pages site.
// dist/ (the editor, `vite build`) gets the guide (site/, `zensical build`) under dist/guide/.
// Run after both builds; `npm run pages:preview` then serves exactly what is deployed.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = `${root}dist`;
const site = `${root}site`;

for (const [dir, how] of [[dist, 'npm run build'], [site, 'npm run docs:build']] as const) {
  if (!existsSync(`${dir}/index.html`)) {
    console.error(`${dir} has no index.html: run \`${how}\` first.`);
    process.exit(1);
  }
}
rmSync(`${dist}/guide`, { recursive: true, force: true });
cpSync(site, `${dist}/guide`, { recursive: true });
// GitHub Pages runs Jekyll on the upload unless this file is there; Jekyll drops folders starting with "_".
cpSync(`${root}tools/pages-nojekyll`, `${dist}/.nojekyll`);
console.log('dist/ holds the editor and dist/guide/ the guide.');
