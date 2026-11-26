// `node tools/check-plans.ts` (retro point 6): checks the structure of docs/feature-plans/NNNN-*.md.
//   - every `## ` heading appears at most once in a plan;
//   - under `## Decisions` the top-level numbered items (`1. **…`) are unique and increasing; so under `## Steps`.
// Prints `file:line: message` for each problem and exits 1 when there is one. Text in code fences is ignored.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface PlanProblem { line: number; message: string }

const NUMBERED_SECTIONS = ['Decisions', 'Steps'];

export function checkPlan(text: string): PlanProblem[] {
  const problems: PlanProblem[] = [];
  const headings = new Map<string, number>();
  let section = '';
  let last = 0;
  let fence = false;
  text.split('\n').forEach((raw, i) => {
    const line = i + 1;
    if (/^\s*(```|~~~)/.test(raw)) { fence = !fence; return; }
    if (fence) return;
    const h = /^## (.*?)\s*$/.exec(raw);
    if (h) {
      const title = h[1]!;
      const first = headings.get(title);
      if (first !== undefined) problems.push({ line, message: `heading "## ${title}" appears twice (first at line ${first})` });
      else headings.set(title, line);
      section = title;
      last = 0;
      return;
    }
    if (!NUMBERED_SECTIONS.includes(section)) return;
    const item = /^(\d+)\. \*\*/.exec(raw);
    if (!item) return;
    const n = Number(item[1]);
    if (n === last) problems.push({ line, message: `${section}: item ${n} appears twice` });
    else if (n < last) problems.push({ line, message: `${section}: item ${n} comes after ${last} (numbers must increase)` });
    else last = n;
  });
  return problems;
}

export function checkPlanFiles(dir: string, label = dir): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).filter((f) => /^\d{4}-.*\.md$/.test(f)).sort()) {
    for (const p of checkPlan(readFileSync(`${dir}/${name}`, 'utf8'))) out.push(`${label}/${name}:${p.line}: ${p.message}`);
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = fileURLToPath(new URL('../docs/feature-plans', import.meta.url));
  const found = checkPlanFiles(dir, 'docs/feature-plans');
  for (const m of found) console.error(m);
  if (found.length) process.exit(1);
  console.log('plans ok');
}
