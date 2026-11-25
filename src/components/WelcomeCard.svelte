<script lang="ts">
  // The welcome card (plan 0012 decision 8): the editor dims and a centred card offers the tour, the dump overlay or nothing.
  // The dim, card, focus trap and focus return are OverlayCard's, as for the tour. Esc = Not now.
  import type { Welcome } from '../app/welcome.svelte.ts';
  import type { DeviceProfile } from '../protocol/profile.ts';
  import { welcomeTexts } from '../app/profile/uc4Tour.ts';
  import OverlayCard from './OverlayCard.svelte';

  let { welcome, profile }: { welcome: Welcome; profile: Pick<DeviceProfile, 'deviceName'> } = $props();
  const t = $derived(welcomeTexts(profile.deviceName));
  let overlay = $state<OverlayCard | null>(null);
  function notNow(): void { welcome.dismiss(); overlay?.release(); }
</script>

<OverlayCard bind:this={overlay} open={welcome.open} labelledby="welcome-title" name="welcome" wide keys={['welcomeEnd']} onkey={notNow}>
  <h2 id="welcome-title">{t.title}</h2>
  <p class="text">{t.lead}</p>
  <p class="text">{t.unofficial}</p>
  <div class="buttons">
    <button type="button" class="go" data-main data-help={t.tourHelp} onclick={() => { welcome.takeTour(); }}>{t.tourLabel}</button>
    <button type="button" data-help={t.getHelp} onclick={() => { welcome.getSetups(); }}>{t.getLabel}</button>
    <button type="button" data-help="Not now · Esc" onclick={notNow}>Not now</button>
  </div>
  <p class="hint">{t.hint}</p>
</OverlayCard>

<style>
  h2 { margin: 0 0 var(--space-2); font-size: var(--text-lg); }
  .text { margin: 0 0 var(--space-2); font-size: var(--text-md); line-height: 1.4; }
  .buttons { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-3); }
  .hint { margin: var(--space-3) 0 0; font-size: var(--text-sm); color: var(--text-muted); line-height: 1.4; }
</style>
