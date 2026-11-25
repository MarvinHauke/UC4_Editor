<script lang="ts">
  // Send (plan 0005 decisions 14, 23, 32): `Send SE16 to UC4…` under the setup list, after Reset and Revert, and the line about the last send.
  // The button only opens the dialog; nothing goes out from here.
  import type { Store } from '../app/libraryStore.svelte.ts';
  import type { Device } from '../app/deviceStore.svelte.ts';
  import type { Sender } from '../app/sender.svelte.ts';
  import type { DeviceProfile } from '../protocol/profile.ts';
  import { slotName } from '../app/format.ts';

  let { store, device, sender, profile }: { store: Store; device: Device; sender: Sender; profile: Pick<DeviceProfile, 'deviceName'> } = $props();
  const setup = $derived(store.state.setups.find((s) => s.id === store.state.selection.setupId));
  const slot = $derived(setup?.slot);
  const why = $derived(
    !device.connected ? `Connect your ${profile.deviceName} first: a send needs the connection`
      : !setup || slot === undefined ? 'This setup has no slot. Give it one in the setup list.'
        : null);
  const help = $derived(why ?? `Send ${slotName(slot!)} "${setup!.name}" to the ${profile.deviceName}: asks first, replaces ${slotName(slot!)} on the device · click`);
</script>

<div class="send">
  <button type="button" disabled={why !== null} aria-describedby={why ? 'send-why' : undefined} data-help={help}
    onclick={() => { if (setup && slot !== undefined) sender.open(slot, setup.name); }}>Send {slot !== undefined ? slotName(slot) : 'setup'} to {profile.deviceName}…</button>
  {#if why}<p class="why" id="send-why">{why}</p>{/if}
  {#if slot !== undefined && store.state.lastSends[slot]}
    <button type="button" class="restore" disabled={!device.connected} data-help={device.connected ? `Restore ${slotName(slot)}: the old ${slotName(slot)} from the backup SndA goes back on the ${profile.deviceName}, after asking, the editor's ${slotName(slot)} stays · click` : `Connect your ${profile.deviceName} first: a restore needs the connection`}
      onclick={() => { if (setup) sender.open(slot, setup.name, 'restore'); }}>Restore {slotName(slot)}…</button>
  {/if}
  {#if sender.line}<p class="line" class:error={sender.line.tone === 'error'} role="status">{sender.line.text}</p>{/if}
</div>

<style>
  .send { margin-top: var(--space-2); }
  p { margin: var(--space-2) 0 0; overflow-wrap: anywhere; }
  .why { color: var(--text-muted); font-size: var(--text-sm); }
  .line { font-size: var(--text-sm); }
  .line.error { color: var(--danger); }
  button { width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-height: var(--target); padding: 3px var(--space-2); font: inherit; color: var(--text); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  .restore { margin-top: var(--space-2); }
  button:hover:not(:disabled) { background: var(--accent-soft); }
  button:disabled { color: var(--text-muted); cursor: not-allowed; }
  button:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
</style>
