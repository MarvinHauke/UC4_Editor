import { describe, expect, it } from 'vitest';
import { controlPathOf, groupKeyOf, isEncoderArea, parseControlPath } from '../../src/model/controlPath.ts';

describe('isEncoderArea / groupKeyOf', () => {
  it('puts encoders and push buttons on the encoder side', () => {
    expect(isEncoderArea('encoders')).toBe(true);
    expect(isEncoderArea('pushButtons')).toBe(true);
    expect(isEncoderArea('faders')).toBe(false);
    expect(isEncoderArea('buttons')).toBe(false);
    expect(groupKeyOf('pushButtons')).toBe('encoderGroups');
    expect(groupKeyOf('faders')).toBe('faderButtonGroups');
  });
});

describe('controlPathOf / parseControlPath', () => {
  it('formats a control path, with an optional property', () => {
    expect(controlPathOf(2, 'encoders', 0, 3)).toBe('setups[2].encoderGroups[0].encoders[3]');
    expect(controlPathOf(0, 'buttons', 7, 1, 'number')).toBe('setups[0].faderButtonGroups[7].buttons[1].number');
  });
  it('parses what it formats', () => {
    expect(parseControlPath('setups[2].encoderGroups[0].encoders[3].number')).toEqual({
      setupIndex: 2, groupKey: 'encoderGroups', group: 0, area: 'encoders', index: 3, property: 'number',
    });
    expect(parseControlPath('setups[1].faderButtonGroups[4].faders[8]')).toEqual({
      setupIndex: 1, groupKey: 'faderButtonGroups', group: 4, area: 'faders', index: 8,
    });
  });
  it('parses a path that stops at the group or the setup', () => {
    expect(parseControlPath('setups[1].encoderGroups[2].name')).toEqual({ setupIndex: 1, groupKey: 'encoderGroups', group: 2 });
    expect(parseControlPath('setups[5].name')).toEqual({ setupIndex: 5 });
  });
  it('returns null for anything else', () => {
    expect(parseControlPath('schemaVersion')).toBeNull();
    expect(parseControlPath('x.setups[0]')).toBeNull();
  });
});
