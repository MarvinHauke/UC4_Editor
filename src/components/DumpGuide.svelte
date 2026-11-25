<script lang="ts">
  // Shows the "Send a dump from the UC4" guide (plan 0010 decision 6) on the device view while dumpGuide is open. Only listens.
  // Esc and Close end it and give focus back to the button that opened it; a dump arriving closes it without moving focus.
  import { onMount } from 'svelte';
  import type { DumpGuide } from '../app/dumpGuide.svelte.ts';
  import type { Device } from '../app/deviceStore.svelte.ts';
  import type { DeviceProfile } from '../protocol/profile.ts';
  import type { Sender } from '../app/sender.svelte.ts';
  import { listenStatus, SEND_CHOICES } from '../app/dumpGuide.ts';
  import { sendGuide, type SendChoice } from '../app/profile/uc4Guides.ts';
  import { useGuide } from '../app/guide.svelte.ts';

  let { dumpGuide, device, sender, profile }: { dumpGuide: DumpGuide; device: Device; sender: Sender; profile: Pick<DeviceProfile, 'deviceName' | 'sendSteps'> } = $props();
  const guide = useGuide();
  let opener: HTMLElement | null = null;
  let shown = false;
  let mine: object | null = null; // the card put up: cleared only while it is still the one on show
  let inCard = false;
  const deviceName = $derived(profile.deviceName);
  const status = $derived(listenStatus(device.state, deviceName));

  function closeByUser(): void { dumpGuide.close(); if (opener?.isConnected) opener.focus(); }
  $effect(() => { if (sender.dialog && dumpGuide.open) dumpGuide.close(); });
  $effect(() => {
    if (dumpGuide.open) {
      if (!shown) opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      shown = true;
      const card = {
        title: `Send a dump from the ${deviceName}`, choices: SEND_CHOICES, choice: dumpGuide.choice,
        onchoose: (v: string) => { dumpGuide.choose(v as SendChoice); }, status: status.text,
        connectLabel: status.connect === 'connect' ? `Connect ${deviceName}` : status.connect === 'again' ? `Connect ${deviceName} again` : null,
        onconnect: () => { void device.connect(); }, onclose: closeByUser, note: profile.sendSteps.all.at(-1) ?? '',
      };
      mine = card;
      guide.show(sendGuide(dumpGuide.choice), card);
    } else if (shown) {
      shown = false;
      if (mine) guide.clear(mine);
      mine = null;
      // A dump closed it while focus was on Close: focus goes to the opener, not to <body>.
      if (inCard && opener?.isConnected) opener.focus();
      inCard = false;
    }
  });
  onMount(() => () => { if (mine) guide.clear(mine); });
  function focusin(e: FocusEvent): void { inCard = e.target instanceof Element && e.target.closest('[data-listen-card]') !== null; }
  function key(e: KeyboardEvent): void {
    if (!dumpGuide.open || e.defaultPrevented || document.querySelector('dialog:modal')) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeByUser(); }
  }
</script>

<svelte:window onkeydowncapture={key} onfocusin={focusin} />
