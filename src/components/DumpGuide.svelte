<script lang="ts">
  // Shows the "Send a dump from the UC4" guide (plan 0010 decision 6) on the device view while dumpGuide is open. Only listens.
  // Esc and Close end it and give focus back to the button that opened it; a dump arriving closes it without moving focus.
  import { onMount } from 'svelte';
  import type { DumpGuide } from '../app/dumpGuide.svelte.ts';
  import type { Device } from '../app/deviceStore.svelte.ts';
  import type { DeviceProfile } from '../protocol/profile.ts';
  import type { Sender } from '../app/sender.svelte.ts';
  import type { ListenCard } from '../app/guide.ts';
  import { listenStatus } from '../app/dumpGuide.ts';
  import { sendGuide, sendChoices } from '../app/profile/uc4Guides.ts';
  import { useGuide } from '../app/guide.svelte.ts';
  import { matchKey } from '../app/keyTable.ts';
  import { createOpener } from '../app/overlay.ts';

  let { dumpGuide, device, sender, profile }: { dumpGuide: DumpGuide; device: Device; sender: Sender; profile: Pick<DeviceProfile, 'deviceName' | 'sendSteps' | 'framing' | 'layout'> } = $props();
  const guide = useGuide();
  const opener = createOpener();
  let wasOpen = false;
  let cardOnShow: ListenCard | null = null; // cleared only while it is still the one on show
  let focusInCard = false;
  const deviceName = $derived(profile.deviceName);
  const choices = $derived(sendChoices({ deviceName, messageNames: profile.framing.messageNames, slotCount: profile.layout.slotCount }));
  const status = $derived(listenStatus(device.state, deviceName));

  function closeByUser(): void { dumpGuide.close(); opener.restore(); }
  $effect(() => { if (sender.dialog && dumpGuide.open) dumpGuide.close(); });
  $effect(() => {
    if (dumpGuide.open) {
      if (!wasOpen) opener.remember();
      wasOpen = true;
      const card: ListenCard = {
        title: `Send a dump from the ${deviceName}`, choices, choice: dumpGuide.choice,
        onchoose: (v) => { dumpGuide.choose(v); }, status: status.text,
        connectLabel: status.connect === 'connect' ? `Connect ${deviceName}` : status.connect === 'again' ? `Connect ${deviceName} again` : null,
        onconnect: () => { void device.connect(); }, onclose: closeByUser, note: profile.sendSteps.all.at(-1) ?? '',
      };
      cardOnShow = card;
      guide.show(sendGuide(dumpGuide.choice), card);
    } else if (wasOpen) {
      wasOpen = false;
      if (cardOnShow) guide.clear(cardOnShow);
      cardOnShow = null;
      // A dump closed it while focus was on Close: focus goes to the opener, not to <body>.
      if (focusInCard) opener.restore();
      focusInCard = false;
    }
  });
  onMount(() => () => { if (cardOnShow) guide.clear(cardOnShow); });
  function focusin(e: FocusEvent): void { focusInCard = e.target instanceof Element && e.target.closest('[data-listen-card]') !== null; }
  function key(e: KeyboardEvent): void {
    if (!dumpGuide.open || e.defaultPrevented || document.querySelector('dialog:modal')) return;
    if (matchKey(e, ['dumpGuideEnd'])) { e.preventDefault(); e.stopPropagation(); closeByUser(); }
  }
</script>

<svelte:window onkeydowncapture={key} onfocusin={focusin} />
