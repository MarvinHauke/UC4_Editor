// Encoder group names: what the UC4 display can show, and how typed text becomes a name.

// What the UC4 display can show in a group name (docs/reference/uc4-device.md). Lower case only.
// `=` is the symbol with the bottom and middle segments lit (device code 25; 0002, 2026-11-14).
export const NAME_CHARS = new Set([...'0123456789abcdefghijlmnopqrstuxyz-_\'"= ']);
const NAME_HINTS: Record<string, string> = {
  k: 'the UC4 has no "k"', w: 'the UC4 has no "w"', v: 'the UC4 shows "v" as "u"; write "u"',
};
/** The JSON Schema pattern for a group name, built from the allowed characters. */
export const NAME_PATTERN = `^[${[...NAME_CHARS].map((c) => (/[\\\]^-]/.test(c) ? `\\${c}` : c)).join('')}]{4}$`;

/** Problems with one group name, or none. */
export function nameProblems(name: string): string[] {
  const chars = [...name];
  const out: string[] = [];
  if (chars.length !== 4) out.push(`"${name}" has ${chars.length} characters; a group name has exactly 4`);
  for (const ch of new Set(chars)) {
    if (NAME_CHARS.has(ch)) continue;
    const lower = ch.toLowerCase();
    out.push(
      lower !== ch && NAME_CHARS.has(lower)
        ? `"${ch}" must be lower case ("${lower}")`
        : `"${ch}" cannot be shown on the UC4${NAME_HINTS[lower] ? `: ${NAME_HINTS[lower]}` : ''}`,
    );
  }
  return out;
}

/**
 * Cleans typed text for a group name: upper case becomes lower case, `v` becomes `u`; characters the
 * display cannot show (`k`, `w`, others) are left out and explained once each in `hints`; the text
 * is cut to 4 characters (with a hint). Pasting a whole word shifts its letters (`kick` → `ic`).
 *   text  the cleaned input, not padded: what a name field shows while the user types.
 *   name  `text` padded with blanks to 4 characters: what goes into the setup.
 */
export function normalizeGroupName(input: string): { text: string; name: string; hints: string[] } {
  const hints: string[] = [];
  let text = '';
  for (const raw of input) {
    const lower = raw.toLowerCase();
    const ch = lower === 'v' ? 'u' : lower;
    if (NAME_CHARS.has(ch)) text += ch;
    else {
      const hint = `"${raw}" cannot be shown on the UC4${NAME_HINTS[lower] ? `: ${NAME_HINTS[lower]}` : ''}`;
      if (!hints.includes(hint)) hints.push(hint);
    }
  }
  const chars = [...text];
  if (chars.length > 4) hints.push(`a group name has 4 characters; "${chars.slice(4).join('')}" was cut off`);
  text = chars.slice(0, 4).join('');
  return { text, name: text.padEnd(4, ' '), hints };
}

const VOWELS = new Set([...'aeiou']);
/** What a label letter becomes on the UC4: the display has no k and no w, and shows v as u. */
const LETTER_MAP: Record<string, string> = { k: 'c', w: 'u', v: 'u' };

/** One word cut to `n` characters: drops the last inner vowel if that is enough, else cuts, but never ends on a vowel if the word's last letter is a consonant. */
function shorten(word: string, n: number): string {
  const chars = [...word];
  if (chars.length <= n) return word;
  if (chars.length === n + 1) {
    for (let i = chars.length - 2; i > 0; i--) {
      if (VOWELS.has(chars[i]!)) return chars.filter((_, k) => k !== i).join('');
    }
  }
  const prefix = chars.slice(0, n);
  const last = chars[chars.length - 1]!;
  if (n >= 3 && VOWELS.has(prefix[n - 1]!) && !VOWELS.has(last)) prefix[n - 1] = last;
  return prefix.join('');
}

/**
 * Suggests a group name from a free-text label (plan 0006 decision 25), using only the device's
 * characters, padded to 4 with blanks like `normalizeGroupName`. `''` when the label has no letter
 * or digit. The name is lower case: NAME_CHARS has no capitals (the display draws some letters big,
 * `FiLt`). Rules: `k` → `c`, `w` → `u`, `v` → `u`; anything else that is not a letter or digit
 * separates words; a trailing number (up to 2 digits) is kept; one word is shortened (`Filter` →
 * `filt`, `Reverb` → `reub` since v shows as u, `Send 1` → `snd1`); several words give the first
 * word's start plus the initials of the others (`LFO Rate` → `lfor`).
 */
export function suggestGroupName(label: string): string {
  const words = [...label.toLowerCase()]
    .map((c) => LETTER_MAP[c] ?? c)
    .join('')
    .split(/[^a-z0-9]+/)
    .filter((w) => w !== '');
  if (words.length === 0) return '';
  let suffix = '';
  if (words.length > 1 && /^[0-9]+$/.test(words[words.length - 1]!)) suffix = words.pop()!.slice(0, 2);
  else if (words.length === 1 && /^[0-9]+$/.test(words[0]!)) return words[0]!.slice(0, 4).padEnd(4, ' ');
  const budget = 4 - suffix.length;
  let letters: string;
  if (words.length === 1) letters = shorten(words[0]!, budget);
  else if (words.join('').length <= budget) letters = words.join('');
  else if (words.length >= budget) letters = words.slice(0, budget).map((w) => w[0]).join('');
  else {
    const rest = words.slice(1).map((w) => w[0]).join('');
    letters = shorten(words[0]!, budget - rest.length) + rest;
  }
  return (letters + suffix).padEnd(4, ' ');
}
