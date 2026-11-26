<script lang="ts">
  // The Connections column (plan 0005 decisions 11–15), far left. Collapsed: a strip with the UC4's state; open: Connection,
  // Received, Kept dumps and how to send a dump from the UC4. It never opens by itself and never takes focus when a dump arrives.
  // Listening only; Send lives under the setup list (decision 32).
  import type { Store } from '../app/libraryStore.svelte.ts';
  import type { Confirm } from '../app/confirm.svelte.ts';
  import type { Device } from '../app/deviceStore.svelte.ts';
  import type { Live } from '../app/liveStore.svelte.ts';
  import type { DumpNotice as Notice } from '../app/dumpNotices.ts';
  import type { DeviceProfile } from '../protocol/profile.ts';
  import { stripInfo } from '../app/connections.ts';
  import ConnectionSection from './ConnectionSection.svelte';
  import DumpNotice from './DumpNotice.svelte';
  import DumpsList from './DumpsList.svelte';
  import MidiMonitor from './MidiMonitor.svelte';

  interface Props {
    device: Device; live: Live; profile: Pick<DeviceProfile, 'deviceName'>; store: Store | null; confirm: Confirm;
    queue: readonly Notice[]; arrivals: number; open: boolean; onopen: (open: boolean) => void;
    onsenddump: () => void; onreview: (n: Notice) => void; onexport: (n: Notice) => void; ondismiss: (n: Notice) => void;
  }
  let { device, live, profile, store, confirm, queue, arrivals, open, onopen, onreview, onexport, ondismiss, onsenddump }: Props = $props();
  let strip = $state<HTMLButtonElement | null>(null);
  let panel = $state<HTMLElement | null>(null);
  const info = $derived(stripInfo(profile.deviceName, device.state, queue.length));
  const openLabel = $derived(queue.length > 0 ? `Close Connections (Esc), ${queue.length} ${queue.length === 1 ? 'dump' : 'dumps'} received` : 'Close Connections (Esc)');

  // Opened by the user (strip or the status bar line): focus moves into the column. A dump never does this.
  export function focusPanel(): void { queueMicrotask(() => { panel?.focus(); }); }
  function toggle(): void { const next = !open; onopen(next); if (next) focusPanel(); }
  function key(e: KeyboardEvent): void {
    if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); onopen(false); strip?.focus(); }
  }
</script>

<!-- Esc is handled on the column as a whole; the focusable parts inside are the real controls. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<aside class="conn" class:open aria-label="Connections" data-help="Connections: the {profile.deviceName} port, received dumps and kept dumps; the editor sends only from Send" onkeydown={key}>
  <button type="button" class="strip" bind:this={strip} aria-expanded={open} aria-label={open ? openLabel : info.label}
    data-help={open ? 'Close Connections · Esc' : `Open Connections: ${info.text}`}
    onclick={toggle}>
    {#if open}<span class="arrow" aria-hidden="true">‹</span>{:else}<span class="dot {info.tone}" aria-hidden="true"></span>{/if}
    {#if queue.length > 0}{#key arrivals}<span class="badge" aria-hidden="true">{queue.length}</span>{/key}{/if}
    <span class="word" aria-hidden="true">{info.text}</span>
  </button>
  {#if open}
    <div class="panel" role="region" tabindex="-1" aria-label="Connections" bind:this={panel}>
      <h2><span class="dot {info.tone}" aria-hidden="true"></span>Connections</h2>
      <ConnectionSection {device} {profile} onconnect={() => { void live.connect(); }} />
      {#if queue.length > 0}
        <section aria-label="Received"><h3>Received</h3><DumpNotice {queue} {onreview} {onexport} {ondismiss} /></section>
      {/if}
      {#if store}<DumpsList {store} {confirm} />{/if}
      <button type="button" class="how" data-help="How to send a dump · UC4: shows the steps on the device view; the editor only listens" onclick={() => { onsenddump(); }}>How to send a dump from the {profile.deviceName}</button>
      <MidiMonitor {live} />
    </div>
  {/if}
</aside>

<style>
  /* Grid cell: the strip's width (the layout pushes when wide). Open and narrow, the panel floats over the properties column. */
  .conn { grid-area: conn; position: relative; z-index: 15; background: var(--surface); border-right: 1px solid var(--border); min-height: 0; }
  .strip {
    display: flex; flex-direction: column; align-items: center; gap: var(--space-2); width: 100%; height: 100%; padding: var(--space-3) 0; font: inherit; font-size: var(--text-sm);
    color: var(--text); background: transparent; border: 0; border-radius: 0; cursor: pointer; position: relative; overflow: hidden;
  }
  .conn.open .strip { width: var(--target); height: var(--target); flex-direction: row; justify-content: center; padding: 0; position: absolute; top: 6px; left: 246px; z-index: 1; overflow: visible; }
  .conn.open .word { display: none; }
  .strip:hover { background: var(--accent-soft); }
  .strip:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--accent); }
  .word { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; color: var(--text-muted); }
  .arrow { font-size: 20px; font-weight: 600; line-height: 1; color: var(--text); }
  .conn.open .badge { position: absolute; top: -2px; right: -2px; min-width: 16px; font-size: 11px; line-height: 16px; padding: 0 3px; box-sizing: border-box; }
  .dot { flex: none; width: 10px; height: 10px; border-radius: 50%; background: var(--led-off); border: 1px solid var(--border); }
  .dot.on { background: var(--led); border-color: var(--led-edge); }
  .dot.warn { background: var(--accent); border-color: var(--accent); }
  .badge { min-width: 18px; padding: 0 4px; text-align: center; font-size: var(--text-sm); color: var(--on-accent); background: var(--accent); border-radius: 9px; animation: pulse 700ms ease-out 1; }
  @keyframes pulse { 0% { transform: scale(1.7); } 100% { transform: scale(1); } }
  @media (prefers-reduced-motion: reduce) { .badge { animation: none; } }
  .panel { display: flex; flex-direction: column; position: absolute; top: 0; left: 0; width: 280px; height: 100%; overflow-y: auto; box-sizing: border-box; padding: var(--space-3); background: var(--surface); border-right: 1px solid var(--border); scrollbar-width: thin; }
  .panel > :global(*) { flex: none; }
  .panel:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--accent); }
  /* 1320 = WIDE_PX in connections.ts */
  @media (min-width: 1320px) { .panel { position: static; width: auto; } .conn.open .strip { left: auto; right: 6px; } }
  h2 { display: flex; align-items: center; gap: var(--space-2); margin: 0 0 var(--space-2); padding-right: 36px; font-size: var(--text-lg); line-height: 24px; }
  section :global(h3), .panel :global(h3) { margin: var(--space-3) 0 var(--space-1); font-size: var(--text-md); }
  .how { margin-top: var(--space-3); min-height: var(--target); width: 100%; padding: 3px var(--space-3); font: inherit; text-align: left; color: var(--text); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  .how:hover { background: var(--accent-soft); }
  .how:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
</style>
