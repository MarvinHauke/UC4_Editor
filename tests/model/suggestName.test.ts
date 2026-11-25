// suggestGroupName: a 4-character group name from a free-text label, with the device's characters only.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { NAME_CHARS, nameProblems, suggestGroupName } from '../../src/model/index.ts';

const cases: [string, string][] = [
  // a long single word: its first 4 letters
  ['Filter', 'filt'],
  // ... unless that would end on a vowel: the word's last letter takes the 4th place (v is u)
  ['Reverb', 'reub'],
  // a word one letter too long loses its last inner vowel
  ['Send 1', 'snd1'],
  // several words: the first word's start plus the initials of the others
  ['LFO Rate', 'lfor'],
  ['Filter Sweep', 'fils'],
  ['Amp Env Atk', 'amea'],
  // short labels are padded with blanks, as normalizeGroupName does
  ['Pan', 'pan '],
  ['a', 'a   '],
  // case is ignored; one letter too many loses the last inner vowel
  ['DRUMS', 'drms'],
  // characters the device lacks: k becomes c, w becomes u, v becomes u
  ['Key', 'cey '],
  ['Wow', 'uou '],
  ['Vox', 'uox '],
  // other characters separate words; a trailing number is kept
  ['Aux-Send 12', 'as12'],
  ['  mix  ', 'mix '],
  ['12', '12  '],
];
for (const [label, name] of cases) {
  test(`suggestGroupName("${label}") is "${name}"`, () => {
    assert.equal(suggestGroupName(label), name);
  });
}

test('nothing usable in the label: no suggestion', () => {
  assert.equal(suggestGroupName(''), '');
  assert.equal(suggestGroupName('  !? '), '');
});

test('a suggestion is always a valid group name', () => {
  for (const label of ['Wavetable Position', 'Köln', 'KICK DRUM 7', 'Ünï', 'x'.repeat(30), 'Send 1234', 'a b c d e f']) {
    const s = suggestGroupName(label);
    if (s === '') continue;
    assert.deepEqual(nameProblems(s), [], label);
    assert.ok([...s].every((c) => NAME_CHARS.has(c)));
  }
});
