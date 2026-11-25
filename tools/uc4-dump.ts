// Dump reader, differ and fixture-note helper. Run with Node >= 22.18 (runs .ts directly):
//   node tools/uc4-dump.ts info <file.syx>
//   node tools/uc4-dump.ts diff <a.syx> <b.syx>
//   node tools/uc4-dump.ts note <file.syx> --from <fixture|none> --change "Enc1 number 8 -> 9" [--firmware 02.05 --slot SE16 --date YYYY-MM-DD --force]
// Only reads dumps; never touches MIDI.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseFrame, splitMessages, writeFrame } from '../src/protocol/frame.ts';
import type { ParsedFrame } from '../src/protocol/frame.ts';
import { buildImage, diffImages, describeAddress } from '../src/protocol/image.ts';

const hex = (n: number, w = 2): string => n.toString(16).padStart(w, '0');

function load(path: string): { frames: ParsedFrame[]; lines: string[] } {
  if (!existsSync(path)) { console.error(`no such file: ${path}`); process.exit(1); }
  const bytes = new Uint8Array(readFileSync(path));
  const messages = splitMessages(bytes);
  const frames: ParsedFrame[] = [];
  const lines: string[] = [`${path}: ${bytes.length} bytes, ${messages.length} message(s)`];
  messages.forEach((m, i) => {
    const r = parseFrame(m);
    if (!r.ok) { lines.push(`  message ${i + 1}: cannot read: ${r.reason}`); return; }
    frames.push(r.frame);
    const f = r.frame;
    const sums = f.records.filter((x) => x.sumOk).length;
    const identical = Buffer.compare(Buffer.from(writeFrame(f)), Buffer.from(m)) === 0;
    lines.push(
      `  message ${i + 1}: ${m.length} bytes, header ${f.header.map((v) => hex(v)).join(' ')}, ` +
        `${f.records.length} records (sum ok ${sums}), trailer ${f.trailer === null ? '-' : hex(f.trailer)}, ` +
        `round trip ${identical ? 'identical' : 'DIFFERS'}, lossless ${f.lossless}`,
    );
    r.warnings.slice(0, 10).forEach((w) => lines.push(`    warning: ${w}`));
  });
  return { frames, lines };
}

function main(argv: string[]): number {
  const [cmd, ...rest] = argv;
  if (cmd === 'info' && rest[0]) {
    const { frames, lines } = load(rest[0]);
    console.log(lines.join('\n'));
    const img = buildImage(frames);
    const cov = img.covered.reduce((n, v) => n + v, 0);
    console.log(`  image: ${cov} bytes covered, ${img.conflicts.length} conflicting writes`);
    return 0;
  }
  if (cmd === 'diff' && rest[0] && rest[1]) {
    const a = load(rest[0]), b = load(rest[1]);
    const changes = diffImages(buildImage(a.frames), buildImage(b.frames));
    const show = (v: number | null): string => (v === null ? '--' : hex(v));
    console.log(`${changes.length} byte(s) differ`);
    for (const c of changes) console.log(`0x${hex(c.address, 4)}  ${show(c.before)} -> ${show(c.after)}  ${describeAddress(c.address)}`);
    return 0;
  }
  if (cmd === 'note' && rest[0]) {
    const opt = (k: string): string => { const i = rest.indexOf('--' + k); return i >= 0 ? (rest[i + 1] ?? '') : ''; };
    if (!existsSync(rest[0])) { console.error(`no such file: ${rest[0]}`); return 1; }
    if (!opt('from') || !opt('change')) { console.error('note needs --from <fixture|none> and --change "<what was changed>"'); return 1; }
    const bytes = readFileSync(rest[0]);
    const note = {
      file: rest[0].split('/').pop(),
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.length,
      firmware: opt('firmware'),
      slot: opt('slot'),
      fromFixture: opt('from'),
      change: opt('change'),
      date: opt('date') || statSync(rest[0]).mtime.toISOString().slice(0, 10),
    };
    const out = rest[0].replace(/\.syx$/i, '') + '.json';
    if (existsSync(out) && !rest.includes('--force')) { console.error(`${out} exists; pass --force to overwrite`); return 1; }
    writeFileSync(out, JSON.stringify(note, null, 2) + '\n');
    console.log(`wrote ${out}`);
    return 0;
  }
  console.error('usage: uc4-dump.ts info <f> | diff <a> <b> | note <f> --from <fixture|none> --change <text> [--firmware v --slot SEnn --date YYYY-MM-DD --force]');
  return 1;
}

process.exit(main(process.argv.slice(2)));
