<script lang="ts">
  // The editor's own settings: one foldable floating panel (plan 0006 decision 14). Opened by the gear,
  // Cmd-, or the drawn Setup button; it remembers whether it is open.
  import { tick, untrack } from 'svelte';
  import { NOTICE } from '../app/links';
  import { MAKER_DEVICE_URL } from '../app/profile/uc4Tour.ts';
  import { SLIDE, slideDuration, type Keys, type Settings, type Theme } from '../app/settings.svelte.ts';

  let { settings, opener, onallkeys, ontour }: { settings: Settings; opener: () => HTMLElement | null; onallkeys: () => void; ontour: () => void } = $props();
  // Shown value: the user's speed, else what applies now (the default, or 0 when the system asks for less motion).
  const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const slideMs = $derived(slideDuration(settings.slideMs, reducedMotion));
  let panel = $state<HTMLElement | null>(null);
  const THEMES: { value: Theme; label: string; help: string }[] = [
    { value: 'system', label: 'System', help: 'follow your computer\'s light or dark mode' },
    { value: 'light', label: 'Light', help: 'always light' },
    { value: 'dark', label: 'Dark', help: 'always dark' },
  ];

  const KEYS: { value: Keys; label: string; help: string }[] = [
    { value: 'standard', label: 'Standard', help: 'Cmd-C copies and Cmd-V pastes' },
    { value: 'vim', label: 'Vim', help: 'also y to copy and p to paste, outside text fields' },
  ];

  // Opening moves focus into the panel; closing hands it back to the gear.
  let wasOpen = untrack(() => settings.open); // restored open at page load: no focus grab
  let returnTo: HTMLElement | null = null;
  let closedByClick = false; // the click lands focus where the user pointed: don't pull it back
  $effect(() => {
    const open = settings.open;
    if (open && !wasOpen) returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (open && !wasOpen) void tick().then(() => { panel?.querySelector<HTMLElement>('input:checked')?.focus(); });
    if (!open && wasOpen && !closedByClick && panel?.contains(document.activeElement)) (returnTo?.isConnected ? returnTo : opener())?.focus();
    if (!open) closedByClick = false;
    wasOpen = open;
  });
  // A click outside closes it; the gear and the drawn Setup button toggle it themselves (no close-then-reopen).
  function outside(e: PointerEvent): void {
    if (!settings.open || !(e.target instanceof Element)) return;
    if (panel?.contains(e.target) || e.target.closest('[data-settings-toggle]')) return;
    closedByClick = true;
    settings.setOpen(false);
  }
  function key(e: KeyboardEvent): void {
    if (e.key === 'Escape') { e.preventDefault(); settings.setOpen(false); }
  }
</script>

<svelte:document onpointerdown={outside} />

{#if settings.open}
  <div class="settings" role="dialog" tabindex="-1" aria-label="Settings" bind:this={panel} onkeydown={key}>
    <header>
      <h2>Settings</h2>
      <button type="button" class="close" aria-label="Close settings" data-help="Close the settings · Esc" onclick={() => { settings.setOpen(false); }}>✕</button>
    </header>
    <fieldset data-help="Theme: light, dark, or your computer's setting">
      <legend>Theme</legend>
      {#each THEMES as t (t.value)}
        <label data-help="Theme {t.label}: {t.help}">
          <input type="radio" name="theme" value={t.value} checked={settings.theme === t.value} onchange={() => { settings.setTheme(t.value); }} />
          {t.label}
        </label>
      {/each}
    </fieldset>
    <fieldset data-help="Keys: how you copy and paste · ? shows all keys">
      <legend>Keys</legend>
      {#each KEYS as k (k.value)}
        <label data-help="Keys {k.label}: {k.help}">
          <input type="radio" name="keys" value={k.value} checked={settings.keys === k.value} onchange={() => { settings.setKeys(k.value); }} />
          {k.label}
        </label>
      {/each}
      <button type="button" class="all-keys" data-help="All keys: the list of every key in the editor · or press ?" onclick={onallkeys}>All keys…</button>
    </fieldset>
    <div class="slide" data-help="Slide speed: how long a group change slides, 0–400 ms (0 = none) · drag the slider">
      <label for="slide-speed">Slide speed <output>{slideMs === 0 ? 'off' : `${slideMs} ms`}</output></label>
      <input id="slide-speed" type="range" min={SLIDE.min} max={SLIDE.max} step={SLIDE.step} value={slideMs}
        oninput={(e) => { settings.setSlideMs(Number(e.currentTarget.value)); }} />
    </div>
    <button type="button" class="tour" data-help="Tour: a short walk through the six areas of the editor, then how to get your setups from the UC4" onclick={ontour}>Tour</button>
    <p class="about" data-help="About: this editor is not from Faderfox · the link opens the UC4's page at Faderfox">{NOTICE} <a href={MAKER_DEVICE_URL} target="_blank" rel="noopener">Faderfox UC4 ↗</a></p>
  </div>
{/if}

<style>
  .settings {
    position: fixed; top: 48px; right: var(--space-3); z-index: 10; width: 260px; padding: var(--space-3);
    background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: var(--radius);
    box-shadow: 0 6px 24px rgb(0 0 0 / 30%);
  }
  header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-2); }
  h2 { margin: 0; font-size: var(--text-lg); }
  .close { width: var(--target); min-height: var(--target); background: transparent; border: 1px solid transparent; border-radius: var(--radius); cursor: pointer; }
  .close:hover { background: var(--surface-2); }
  .close:focus-visible, input:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  fieldset { margin: 0 0 var(--space-2); padding: 0; border: 0; display: flex; flex-direction: column; }
  legend { padding: 0; font-weight: 600; margin-bottom: var(--space-1); }
  label { display: flex; gap: var(--space-2); align-items: center; min-height: var(--target); cursor: pointer; }
  input[type='radio'] { width: 16px; height: 16px; margin: 0; accent-color: var(--accent); }
  .all-keys { align-self: flex-start; min-height: var(--target); margin-top: var(--space-1); padding: 3px var(--space-3); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  .all-keys:hover { background: var(--accent-soft); }
  .all-keys:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  .tour { display: inline-flex; align-items: center; min-height: var(--target); margin-top: var(--space-2); padding: 3px var(--space-3); color: var(--text); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  .tour:hover { background: var(--accent-soft); }
  .tour:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  .about { margin: var(--space-3) 0 0; padding-top: var(--space-2); border-top: 1px solid var(--border); font-size: var(--text-sm); color: var(--text-muted); }
  .slide { display: flex; flex-direction: column; gap: var(--space-1); }
  .slide label { justify-content: space-between; min-height: 0; }
  .slide output { font: var(--text-sm) var(--mono); color: var(--text-muted); }
  .slide input { width: 100%; min-height: var(--target); margin: 0; accent-color: var(--accent); cursor: pointer; }
</style>
