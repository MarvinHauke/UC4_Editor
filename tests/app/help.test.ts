import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHelp } from '../../src/app/help.svelte.ts';

// A minimal DOM: just the listeners `attach` registers, and elements with `data-help`.
class FakeElement {
  isConnected = true;
  constructor(private help: string | null) {}
  closest(selector: string): FakeElement | null { return selector === '[data-help]' && this.help !== null ? this : null; }
  getAttribute(): string | null { return this.help; }
}
type Listener = (e: { target: unknown }) => void;
const handlers = new Map<string, Listener>();
const fake = (): { addEventListener: (t: string, l: Listener) => void; removeEventListener: (t: string) => void; documentElement: unknown } => ({
  addEventListener: (t, l) => { handlers.set(t, l); },
  removeEventListener: (t) => { handlers.delete(t); },
  documentElement: { addEventListener: (t: string, l: Listener) => { handlers.set(t, l); }, removeEventListener: (t: string) => { handlers.delete(t); } },
});
const g = globalThis as Record<string, unknown>;

beforeEach(() => { handlers.clear(); g.document = { ...fake(), activeElement: null }; g.Element = FakeElement; });
afterEach(() => { delete g.document; delete g.Element; });

describe('help line source', () => {
  it('keeps the last text over a gap and changes only on a new element with help', () => {
    const help = createHelp();
    const stop = help.attach();
    handlers.get('pointerover')!({ target: new FakeElement('first') });
    expect(help.text()).toBe('first');
    handlers.get('pointerover')!({ target: new FakeElement(null) }); // a gap
    expect(help.text()).toBe('first');
    handlers.get('pointerover')!({ target: new FakeElement('second') });
    expect(help.text()).toBe('second');
    handlers.get('pointerleave')!({ target: null });
    expect(help.text()).toBeNull();
    stop();
  });
  it('does not write state in the focusout handler itself (it fires while Svelte tears an element down)', async () => {
    const help = createHelp();
    help.attach();
    handlers.get('focusin')!({ target: new FakeElement('field') });
    expect(help.text()).toBe('field');
    (g.document as { activeElement: unknown }).activeElement = null; // focus really left
    handlers.get('focusout')!({ target: null });
    expect(help.text()).toBe('field'); // not yet: the write is deferred
    await Promise.resolve();
    expect(help.text()).toBeNull();
  });
  it('keeps the new element when focus is moved by script (focusout and focusin both run before the microtask)', async () => {
    const help = createHelp();
    help.attach();
    const a = new FakeElement('A');
    const b = new FakeElement('B');
    handlers.get('focusin')!({ target: a });
    (g.document as { activeElement: unknown }).activeElement = b; // el.focus() from script
    handlers.get('focusout')!({ target: a });
    handlers.get('focusin')!({ target: b });
    await Promise.resolve();
    expect(help.text()).toBe('B');
  });
});
