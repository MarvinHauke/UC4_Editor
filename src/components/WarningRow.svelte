<script lang="ts">
  // One entry of the Warnings dialog (plan 0008 decisions 31, 32): the message, under it what Resolve would do, and the actions in
  // three fixed columns: Show · ↺ Resolve · Ignore (an ignored row shows the pressed "Ignored"; a factory row has neither).
  import type { ResolveOption } from '../app/resolveView.ts';

  interface Props {
    problem?: boolean;
    /** The setup's name above the message (scope "all setups"). */
    where?: string;
    message: string;
    options: ResolveOption[];
    sideBySide?: boolean;
    quiet?: boolean;
    /** 'open': Ignore · 'ignored': the pressed Ignored · 'none': no button (problems, the factory layout). */
    ignore?: 'open' | 'ignored' | 'none';
    showHelp: string;
    onshow: () => void;
    onresolve: (choice: number) => void;
    onignore?: () => void;
  }
  let { problem = false, where, message, options, sideBySide = false, quiet = false, ignore = 'none', showHelp, onshow, onresolve, onignore }: Props = $props();
  const first = $derived(options[0]);
  const second = $derived(options[1]);
</script>

<li class="entry" class:problem class:quiet>
  <span class="mark" aria-hidden="true">{problem ? '●' : '▲'}</span>
  <span class="text">
    {#if problem}<span class="what">Problem</span>{/if}
    {#if where}<span class="where">{where}</span>{/if}
    <span class="msg">{message}</span>
    {#if options.length > 0}
      <span class="sugg">
        {#if sideBySide}
          {#each options as o (o.choice)}
            <button type="button" class="alt" disabled={!o.ok} onclick={() => { onresolve(o.choice); }}
              data-help={o.ok ? `Resolve: ${o.label} · one undo step · the control is selected and the changed field flashes` : o.label}><span aria-hidden="true">↺</span> {o.label}</button>
          {/each}
        {:else}
          {#if first}<span class="line">{first.label}</span>{/if}
          {#if second}
            <button type="button" class="alt" disabled={!second.ok} onclick={() => { onresolve(second.choice); }}
              data-help={second.ok ? `Change ${second.short} instead: ${second.label} · one undo step` : second.label}>{second.ok ? `change ${second.short} instead → ${second.text}` : `${second.label}`}</button>
          {/if}
        {/if}
      </span>
    {/if}
  </span>
  <span class="actions">
    <button type="button" class="c1" onclick={onshow} data-help={showHelp}>Show</button>
    {#if !sideBySide && first}
      <button type="button" class="c2" disabled={!first.ok} onclick={() => { onresolve(first.choice); }}
        data-help={first.ok ? `Resolve: ${first.label} · one undo step · the control is selected and the changed field flashes` : first.label}><span aria-hidden="true">↺</span> Resolve</button>
    {/if}
    {#if ignore === 'open'}
      <button type="button" class="c3" onclick={onignore} data-help="Ignore: accept this warning; it moves to Ignored and stops counting until one of the two controls changes · Undo brings it back">Ignore</button>
    {:else if ignore === 'ignored'}
      <button type="button" class="c3 on" aria-pressed="true" onclick={onignore} data-help="Ignored: this warning does not count · click to count it again">Ignored</button>
    {/if}
  </span>
</li>

<style>
  button { min-height: var(--target); padding: 0 var(--space-2); font: inherit; color: var(--text); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  button:hover:not(:disabled) { background: var(--accent-soft); }
  button:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  button:disabled { color: var(--text-muted); cursor: default; opacity: 0.6; }
  .entry { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border); }
  .mark { flex: none; width: 1em; color: var(--warn); }
  .problem .mark { color: var(--danger); }
  .text { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-items: baseline; column-gap: var(--space-2); overflow-wrap: anywhere; }
  /* The message takes a line of its own; the setup name above and the suggestion below are small notes. */
  .msg { flex: 1 1 100%; }
  .quiet .text { color: var(--text-muted); }
  .what { font-weight: 600; color: var(--danger); }
  .where, .sugg { font-size: var(--text-sm); color: var(--text-muted); }
  .sugg { flex: 1 1 100%; display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
  .alt { min-height: 24px; font-size: var(--text-sm); white-space: nowrap; }
  /* Three fixed columns, so Show, Resolve and Ignore stand at the same x in every row; a row without one leaves its column empty. */
  .actions { flex: none; display: grid; grid-template-columns: 4.5em 6.5em 6em; gap: var(--space-2); }
  .actions button { min-width: 0; width: 100%; }
  .c1 { grid-column: 1; } .c2 { grid-column: 2; } .c3 { grid-column: 3; }
  .c3.on { color: var(--on-accent); background: var(--accent); border-color: var(--accent); }
</style>
