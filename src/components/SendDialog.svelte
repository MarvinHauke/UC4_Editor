<script lang="ts">
  // The Send dialog (plan 0005 decisions 23–25, 28, 30, 31): what goes out, what it replaces, what the backup holds. Esc and Cancel
  // send nothing. A SndA arriving while it is open re-plans it (decision 31: the backup is optional).
  import { onMount } from 'svelte';
  import type { Store } from '../app/libraryStore.svelte.ts';
  import type { Device } from '../app/deviceStore.svelte.ts';
  import type { Sender } from '../app/sender.svelte.ts';
  import type { DeviceProfile } from '../protocol/profile.ts';
  import { restoreView, sendView } from '../app/sendFlow.ts';
  import { useGuide } from '../app/guide.svelte.ts';
  import { RECEIVE_GUIDE } from '../app/profile/uc4Guides.ts';
  import { formatExported } from '../app/format.ts';
  import { useWarningsDialog } from '../app/warningsDialog.svelte.ts';

  let { store, device, sender, profile }: { store: Store; device: Device; sender: Sender; profile: Pick<DeviceProfile, 'deviceName' | 'sendSteps'> } = $props();
  let dialog = $state<HTMLDialogElement | null>(null);
  const target = $derived(sender.dialog);
  // The plan is read again whenever the kept dumps, the setups or the connection change: a SndA arriving changes the base of the change list and the backup line.
  const plan = $derived.by(() => {
    void store.state.dumps; void store.state.configuration; void device.state;
    const at = device.connectedAt;
    if (!target || at === null) return null;
    return target.kind === 'restore' ? store.planRestore(target.slot, { connectedAt: at }) : store.planSend(target.slot, { connectedAt: at });
  });
  const dateOf = (id: string): string => { const d = store.state.dumps.find((k) => k.id === id); return d ? formatExported(d.date) : ''; };
  // How to make the UC4 send a SndA, for the no-backup line's tooltip and help line.
  const sndaHelp = $derived(`A fresh SndA backup of all setups comes first · UC4: Shift + Setup, SndA`);
  // The setup may change while the dialog is open (it is not modal: Undo, Reset, rename): its name is read live, and the
  // dialog closes when the slot has no setup any more.
  const liveName = $derived(target ? store.state.setups.find((x) => x.slot === target.slot)?.name : undefined);
  $effect(() => { if (target && liveName === undefined) sender.close(); });
  const view = $derived.by(() => {
    if (!target || !plan || liveName === undefined) return null;
    return target.kind === 'restore'
      ? restoreView(plan as Parameters<typeof restoreView>[0], target.slot, liveName, profile.deviceName, formatExported)
      : sendView(plan as Parameters<typeof sendView>[0], target.slot, liveName, profile.deviceName, dateOf);
  });

  // Beside the device view, not over it (decision 33): the dialog is not modal and sits over the properties column, so the
  // drawn UC4 stays in sight with what the guide lights on it.
  const guide = useGuide();
  const warningsDialog = useWarningsDialog();
  // Open warnings of the setup that goes out (plan 0008 decision 7): listed here; "Send anyway" ignores them and sends. A restore sends a backup, not this setup.
  const pending = $derived(target && target.kind === 'send' ? store.allWarnings.filter((w) => w.state === 'open' && w.slot === target.slot) : []);
  let dock = $state({ left: 0, top: 0, width: 288, height: 400 });
  function place(): void {
    const r = document.querySelector('[data-area="properties"]')?.getBoundingClientRect();
    if (r) dock = { left: r.left, top: r.top, width: Math.max(260, r.width), height: r.height };
  }
  $effect(() => {
    if (target && dialog && !dialog.open) { place(); dialog.show(); dialog.querySelector('button')?.focus(); }
    else if (!target && dialog?.open) dialog.close();
  });
  // The guide: the device view dimmed, three callouts and the card with Cancel · Send/Restore (decision 35). Only while the question
  // is on: a refusal has nothing to send.
  let mine: object | null = null; // the card this dialog put up: it clears only that one (the dump guide has its own)
  const canConfirm = $derived(plan?.ok === true && device.connected);
  $effect(() => {
    if (target && view?.kind === 'confirm') {
      const restoring = target.kind === 'restore';
      const card = {
        text: `Put the ${profile.deviceName} in receive mode (rc00), then ${restoring ? 'Restore' : 'Send'}.`,
        confirmLabel: restoring ? 'Restore' : pending.length > 0 ? 'Send anyway' : 'Send', canConfirm, onconfirm: send, oncancel: () => { sender.close(); },
      };
      mine = card;
      guide.show(RECEIVE_GUIDE, card);
    } else if (mine) { guide.clear(mine); mine = null; }
  });
  onMount(() => { window.addEventListener('resize', place); return () => { window.removeEventListener('resize', place); if (mine) guide.clear(mine); if (dialog?.open) dialog.close(); }; });
  function send(): void {
    if (!target || !plan?.ok || !device.connected) return;
    const p = plan, t = target, accepted = pending;
    // "Send anyway": the warnings are ignored (one undo step) only once the UC4's port took the send.
    sender.send(t.slot, p, t.kind, accepted.length > 0 ? () => { store.ignore(accepted); } : undefined);
  }
  // A non-modal dialog has no Esc of its own.
  function key(e: KeyboardEvent): void {
    // Not when another question (a modal confirm) is on top: its Esc is its own.
    if (e.defaultPrevented || document.querySelector('dialog:modal')) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); sender.close(); } }
</script>

<svelte:window onkeydown={(e) => { if (target) key(e); }} />

<dialog bind:this={dialog} oncancel={(e) => { e.preventDefault(); sender.close(); }} aria-labelledby="send-title"
  style:left="{dock.left}px" style:top="{dock.top}px" style:width="{dock.width}px" style:height="{dock.height}px">
  {#if target && !view}
    <h2 id="send-title">The {profile.deviceName} is not connected</h2>
    <p>Connect it by USB and press Connect, then try again. Nothing was sent.</p>
    <div class="buttons"><button type="button" onclick={() => { sender.close(); }}>Close</button></div>
  {:else if view?.kind === 'confirm'}
    <h2 id="send-title">{view.title}</h2>
    <p>{view.replaces}</p>
    {#if view.changesTitle}<h3>{view.changesTitle}</h3>{/if}
    {#if view.noChanges}
      <p class="muted">{view.noChanges}</p>
    {:else}
      <ul class="changes" aria-label="Changes">
        {#each view.changes as c, i (i)}<li>{c}</li>{/each}
        {#if view.moreLine}<li class="more">{view.moreLine}</li>{/if}
      </ul>
    {/if}
    {#if pending.length > 0}
      <h3 class="warn"><span aria-hidden="true">▲</span> {pending.length} warning{pending.length === 1 ? '' : 's'} in this setup</h3>
      <ul class="changes" aria-label="Warnings">
        {#each pending.slice(0, 5) as w, i (i)}<li>{w.message}</li>{/each}
        {#if pending.length > 5}<li class="more">+ {pending.length - 5} more</li>{/if}
      </ul>
      <p class="muted">A warning blocks nothing. “Send anyway” ignores these, so they stop counting; Undo brings them back.
        <button type="button" class="review" onclick={() => { warningsDialog.show(); }} data-help="Review: opens the list of warnings, to show or ignore them one by one · this dialog stays">Review…</button></p>
    {/if}
    {#if view.backup.text}<p title={view.backup.has ? undefined : sndaHelp} data-help={view.backup.has ? undefined : sndaHelp}>{view.backup.text}</p>{/if}
  {:else if view?.kind === 'refused'}
    <h2 id="send-title">{view.title}</h2>
    <p>{view.reason}</p>
    {#if view.fields.length > 0}<ul class="changes">{#each view.fields as f, i (i)}<li>{f}</li>{/each}</ul>{/if}
    <p>{view.whatToDo}</p>
    <p class="muted">Nothing was sent to the {profile.deviceName}.</p>
    <div class="buttons"><button type="button" onclick={() => { sender.close(); }}>Close</button></div>
  {/if}
</dialog>

<style>
  .warn { color: var(--warn); }
  .review { margin-left: var(--space-2); }
  h3 { margin: var(--space-2) 0 var(--space-1); font-size: var(--text-md); }
  dialog { position: fixed; margin: 0; z-index: 20; box-sizing: border-box; overflow-y: auto; padding: var(--space-3); color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
  h2 { margin: 0 0 var(--space-2); font-size: var(--text-lg); overflow-wrap: anywhere; }
  p { margin: 0 0 var(--space-2); }
  .muted { color: var(--text-muted); font-size: var(--text-sm); }
  /* Fixed height range: the list never makes the dialog jump (8 lines and "+ n more" fit). */
  .changes { margin: 0 0 var(--space-2); padding: var(--space-1) var(--space-2) var(--space-1) var(--space-4); max-height: 200px; overflow-y: auto; font: var(--text-sm) var(--mono); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); overflow-wrap: anywhere; }
  .more { list-style: none; margin-left: calc(-1 * var(--space-3)); color: var(--text-muted); }
  .buttons { display: flex; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-3); }
  button { min-height: var(--target); padding: 3px var(--space-3); font: inherit; color: var(--text); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  button:hover:not(:disabled) { background: var(--accent-soft); }
  button:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  button:disabled { color: var(--text-muted); cursor: not-allowed; }
</style>
