<script lang="ts">
  // Connection: the UC4's state in words, the port choice and Connect.
  import type { Device } from '../app/deviceStore.svelte.ts';
  import type { DeviceProfile } from '../protocol/profile.ts';

  let { device, profile, onconnect }: { device: Device; profile: Pick<DeviceProfile, 'deviceName'>; onconnect: () => void } = $props();
  // One Connect for both listeners: the browser's permission is asked once, the monitor then lists every input.
  const connect = (): void => { void device.connect(); onconnect(); };
  const conn = $derived(device.state);
</script>

<section aria-label="Connection">
  <h3>Connection</h3>
  {#if conn.kind === 'connected'}
    <p class="status ok" data-help="Connected: the editor listens to this port · UC4: a dump you send arrives here">Connected to <strong>{conn.port.name}</strong>. The editor is listening; it sends only when you ask it to.</p>
  {:else if conn.kind === 'choose-port'}
    <p class="status" data-help="Several ports match: select the one that is your {profile.deviceName}">Several ports match. Select your {profile.deviceName}:</p>
    <ul class="ports">
      {#each conn.candidates as port (port.id)}
        <li><button type="button" onclick={() => { device.choosePort(port.id); }}>{port.name}</button></li>
      {/each}
    </ul>
  {:else}
    <p class="status" class:error={conn.kind === 'denied' || conn.kind === 'unsupported'} role={conn.kind === 'denied' ? 'alert' : undefined}>{conn.message}</p>
    {#if conn.kind === 'not-connected' && !conn.access}
      <button type="button" data-help="Connect {profile.deviceName}: the browser asks for MIDI access once; the editor then only listens"
        onclick={connect}>Connect {profile.deviceName}</button>
    {:else if conn.kind === 'denied'}
      <button type="button" data-help="Connect again: allow MIDI for this site in the browser's settings first" onclick={connect}>Connect {profile.deviceName} again</button>
    {/if}
  {/if}
</section>

<style>
  h3 { margin: 0 0 var(--space-1); font-size: var(--text-md); }
  .status { margin: 0 0 var(--space-2); overflow-wrap: anywhere; }
  .status.error { color: var(--danger); }
  .ports { list-style: none; margin: 0 0 var(--space-2); padding: 0; display: flex; flex-direction: column; gap: var(--space-1); }
  button { min-height: var(--target); padding: 3px var(--space-3); font: inherit; text-align: left; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  button:hover { background: var(--accent-soft); }
  button:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
</style>
