<script lang="ts">
  import { onMount, setContext, tick, untrack } from 'svelte';
  import type { Opened } from '../storage/index.ts';
  import { createStore, type Store } from './libraryStore.svelte.ts';
  import { createHelp } from './help.svelte.ts';
  import LibraryList from '../components/LibraryList.svelte';
  import DeviceView from '../components/DeviceView.svelte';
  import PropertyPanel from '../components/PropertyPanel.svelte';
  import StatusBar from '../components/StatusBar.svelte';
  import Toolbar from '../components/Toolbar.svelte';
  import { GUIDE_URL } from './links';
  import ConfirmDialog from '../components/ConfirmDialog.svelte';
  import ListResizeHandle from '../components/ListResizeHandle.svelte';
  import { LIST_WIDTH, loadWidth, saveWidth } from './listWidth.ts';
  import ConnectionsColumn from '../components/ConnectionsColumn.svelte';
  import { loadOpen, saveOpen, WIDE_PX } from './connections.ts';
  import { createDevice } from './deviceStore.svelte.ts';
  import { createDeviceConnection } from '../midi/connection.ts';
  import { appMidiEnv } from './midiEnv.ts';
  import { createMidiInputs } from '../midi/inputs.ts';
  import { createLive, LIVE_CONTEXT } from './liveStore.svelte.ts';
  import { selectMatch } from './liveView.ts';
  import { createSwitchNote, SWITCH_CONTEXT, type SwitchUi } from './switchNote.svelte.ts';
  import { createMapFlow, MAP_CONTEXT, type MapUi } from './mapFlow.svelte.ts';
  import type { Match } from '../live/index.ts';
  import { GUIDE_CONTEXT, createGuide } from './guide.svelte.ts';
  import { COPY_CONTEXT, createCopyHold } from './copyHold.svelte.ts';
  import { copyKey, isTextTarget, levelOf } from './copyPaste.ts';
  import { matchKey } from './keyTable.ts';
  import KeysHelp from '../components/KeysHelp.svelte';
  import { createSender } from './sender.svelte.ts';
  import SendDialog from '../components/SendDialog.svelte';
  import DumpGuide from '../components/DumpGuide.svelte';
  import TourOverlay from '../components/TourOverlay.svelte';
  import WelcomeCard from '../components/WelcomeCard.svelte';
  import { createTour } from './tour.svelte.ts';
  import { createWelcome } from './welcome.svelte.ts';
  import { shouldWelcome } from './tour.ts';
  import { createDumpGuide } from './dumpGuide.svelte.ts';
  import { createNotices } from './dumpNotices.svelte.ts';
  import { noticeOf, withImportHook, type DumpNotice as Notice } from './dumpNotices.ts';
  import { startImport, type FlowUi } from './importFlow.ts';
  import { download, downloadBytes } from './download.ts';
  import { faderfoxUc4 } from '../protocol/profiles/uc4.ts';
  import { uc4Engine } from '../protocol/engine.ts';
  import SettingsPanel from '../components/SettingsPanel.svelte';
  import { createConfirm } from './confirm.svelte.ts';
  import { SETTINGS_CONTEXT, createSettings } from './settings.svelte.ts';
  import { ACTIVE_AREA_CONTEXT, createActiveArea } from './activeArea.svelte.ts';

  // The shell shows at once; the library fills it when opening is done (it may wait on another tab).
  let { opening }: { opening: Promise<Opened> } = $props();
  let store = $state.raw<Store | null>(null);
  let openError = $state<string | null>(null);
  const help = createHelp();
  const confirm = createConfirm();
  const settings = createSettings();
  setContext(SETTINGS_CONTEXT, settings);
  // The device connection: listening only; it asks the browser for MIDI access only when the user presses Connect.
  const midiEnv = appMidiEnv();
  const device = createDevice(createDeviceConnection({ portName: faderfoxUc4.portName, deviceName: faderfoxUc4.deviceName, env: midiEnv, checkSendable: uc4Engine.checkSendable }));
  // The MIDI monitor's inputs (plan 0008): the same browser access, listening only.
  const live = createLive(createMidiInputs({ portName: faderfoxUc4.portName, env: midiEnv, connectLabel: `Connect ${faderfoxUc4.deviceName}` }));
  setContext(LIVE_CONTEXT, live);
  setContext(GUIDE_CONTEXT, createGuide());
  const notices = createNotices();
  const dumpGuide = createDumpGuide();
  const tour = createTour();
  const welcome = createWelcome(tour, () => { getSetups(); });
  const sender = createSender(device, faderfoxUc4.deviceName, (slot, plan) => { store?.recordSend(slot, plan); });
  // A dump can arrive before the library has opened: it waits here, then is kept like any other.
  let waiting: Uint8Array[] = [];
  function received(bytes: Uint8Array): void {
    if (!store) { waiting.push(bytes); return; }
    const notice = noticeOf(store.keepReceived(bytes));
    // What the UC4 sends back after a send, byte for byte: kept as usual, but it is not news.
    if (notice && sender.matches(bytes)) return;
    if (notice) { notices.add(notice); arrivals += 1; dumpGuide.close(); }
    else store.say('The UC4 sent a MIDI message that is not a dump. Nothing was changed.');
  }
  const flowUi: FlowUi = { ask: (spec) => { confirm.ask(spec); }, download, say: (text) => { store?.say(text); } };
  // Review opens the import dialog on the kept bytes (the library links the import to the kept dump, keeping nothing twice).
  // The notice goes only when the import happens: a Cancel leaves it, so the dump can be reviewed again.
  function review(n: Notice): void {
    const file = store?.exportDump(n.dumpId).file;
    if (!store || !file) { notices.remove(n.dumpId); store?.say('That dump was deleted; there is nothing to review.'); return; }
    startImport(withImportHook(store.flow, () => { notices.remove(n.dumpId); }), flowUi, 'the dump from the UC4', file.bytes, 'dump');
  }
  function exportNotice(n: Notice): void {
    const file = store?.exportDump(n.dumpId).file;
    if (!file) { notices.remove(n.dumpId); store?.say('That dump was deleted; there is nothing to export.'); return; }
    downloadBytes(file.name, file.bytes);
    store?.say(`Exported the dump as ${file.name}, byte for byte as it came.`);
  }
  // A dump deleted from the Dumps list takes its notice with it.
  $effect(() => { if (store) { const ids = store.state.dumps.map((d) => d.id); untrack(() => { notices.keepOnly(ids); }); } });
  let connOpen = $state(loadOpen());
  // Below WIDE_PX the open column covers the properties column, so those fields must not take focus (keep in step with the @media rules).
  let wide = $state(typeof matchMedia === 'function' ? matchMedia(`(min-width: ${WIDE_PX}px)`).matches : true);
  let arrivals = $state(0); // counts dumps coming in, so the strip pulses for those only
  let column = $state<ReturnType<typeof ConnectionsColumn> | null>(null);
  function setConnOpen(open: boolean): void { connOpen = open; saveOpen(open); }
  function openConnections(): void { setConnOpen(true); column?.focusPanel(); }
  const active = createActiveArea();
  setContext(ACTIVE_AREA_CONTEXT, active);
  const copyHold = createCopyHold(() => store, () => active.section);
  setContext(COPY_CONTEXT, copyHold);
  let listWidth = $state(loadWidth());
  // The width the list really has (it can be narrower than the stored one on a small window): the handle works from this.
  let shownWidth = $state(0);
  let gear = $state<HTMLButtonElement | null>(null);
  // The theme is a data attribute on the page; `system` leaves it off so the system's choice applies.
  $effect(() => {
    if (settings.theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = settings.theme;
  });
  // The live view ranks matches by the open setup and its two group selections (plan 0008 decision 4).
  $effect(() => {
    const s = store?.state;
    live.setContext(s ? { configuration: s.configuration, setupId: s.selection.setupId, encoderGroup: s.selection.encoderGroup, faderButtonGroup: s.selection.faderButtonGroup } : null);
  });
  /** A click on a UC4 row: shows its best match (its group, and its setup when it is another one) as ordinary selections. */
  function showMatch(match: Match): void {
    if (store) selectMatch(store, match, store.state.selection.setupId);
  }
  /** The offer's yes: the target's setup and both groups in one selection change. */
  const switchNote = createSwitchNote();
  function acceptOffer(silence: boolean): void {
    if (!store) return;
    const offer = live.acceptOffer();
    if (!offer) return;
    store.switchTo(offer.target); // one undo step
    if (silence) live.declineOffer(true);
    switchNote.show(offer, store.state.configuration);
  }
  /** Back is the undo of the switch step. */
  function switchBack(): void {
    if (!switchNote.note || !store) return;
    switchNote.clear();
    store.undo();
  }
  // The offer and its Back note: shown in the Connections column, or in the status bar while the column is closed.
  const switchUi: SwitchUi = {
    get offer() { return live.offer; },
    get note() { return switchNote.note; },
    accept: acceptOffer,
    decline: (silence) => { live.declineOffer(silence); },
    back: switchBack,
  };
  setContext(SWITCH_CONTEXT, switchUi);
  // Map (plan 0008 steps 7 and 8): arm a monitor row, then click a control or move one on the UC4.
  const focusUpper = (): void => { void tick().then(() => { document.querySelector<HTMLElement>('[data-property="upper"] input')?.focus(); }); };
  const mapFlow = createMapFlow({ live, store: () => store, spotRelative: () => settings.spotRelative, focusUpper });
  const mapTargets = $derived.by(() => {
    const key = live.armed;
    return key ? new Map(live.mapTargets(key).map((t) => [t.control.id, { ok: t.ok, reason: t.reason }])) : new Map<string, { ok: boolean; reason: string | null }>();
  });
  const mapUi: MapUi = { flow: mapFlow, get targets() { return mapTargets; } };
  setContext(MAP_CONTEXT, mapUi);
  // Map by touch: the first UC4 message that matches a control while armed picks it.
  $effect(() => { if (live.armed !== null && live.touchTarget !== null) untrack(() => { mapFlow.touch(); }); });
  // The result line goes when anything else changes the configuration (Undo would undo that instead).
  $effect(() => { const c = store?.state.configuration; if (c !== undefined) mapFlow.changed(c); });
  $effect(() => {
    const state = store?.state;
    if (state) switchNote.changed({ setupId: state.selection.setupId, encoderGroup: state.selection.encoderGroup, faderButtonGroup: state.selection.faderButtonGroup }, state.configuration);
  });
  onMount(() => {
    const mq = matchMedia(`(min-width: ${WIDE_PX}px)`);
    const onWide = (): void => { wide = mq.matches; };
    mq.addEventListener('change', onWide);
    const detach = help.attach();
    const stopSysex = device.onSysex((m) => { received(m.bytes); }); // listening only
    void device.reconnect(); // silent: only when the permission is already given
    void live.reconnect();
    opening.then(
      ({ library, message }) => {
        store = createStore(library, message);
        for (const bytes of waiting.splice(0)) received(bytes);
      },
      (e: unknown) => {
        const lost = waiting.length > 0 ? ` ${waiting.length} dump${waiting.length === 1 ? '' : 's'} from the UC4 arrived and could not be kept.` : '';
        openError = `The library could not be opened (${e instanceof Error ? e.message : String(e)}). Reload to try again.${lost}`;
      },
    );
    return () => { mq.removeEventListener('change', onWide); stopSysex(); detach(); device.dispose(); live.dispose(); };
  });

  // The keys that work anywhere (key table, "Anywhere"): Cmd-Z / Shift-Cmd-Z over the whole library (not while typing, nor behind a dialog), Cmd-, for Settings, ? for the key help.
  let keysOpen = $state(false);
  function globalKeys(e: KeyboardEvent): void {
    const hit = matchKey(e, ['settings', 'undo', 'redo', 'keys']);
    if (!hit) return;
    const target = e.target;
    const inDialog = target instanceof Element && target.closest('dialog, [role="dialog"]');
    if (hit.id === 'settings') {
      if (confirm.current || inDialog) return; // not behind a dialog
      e.preventDefault(); settings.toggle(); return;
    }
    if (hit.id === 'keys') {
      if (e.defaultPrevented || isTextTarget(target) || confirm.current || (inDialog && !keysOpen)) return;
      e.preventDefault(); if (keysOpen) closeKeys(); else keysOpen = true; return;
    }
    if (!store) return;
    if (target instanceof Element && target.closest('input, select, textarea, [contenteditable], dialog')) return;
    e.preventDefault();
    if (hit.id === 'redo') store.redo(); else store.undo();
  }
  // The welcome card shows by itself once, when the library has opened empty-handed: no kept dump, factory setups, not seen.
  let tourChecked = false;
  $effect(() => {
    if (!store || tourChecked) return;
    tourChecked = true;
    untrack(() => {
      if (!store) return;
      const { dumps, differsFromFactory } = store.state;
      // Not over an open dialog (it sits in the top layer above the tour).
      if (!document.querySelector('dialog[open]') && shouldWelcome({ seen: tour.seen, keptDumps: dumps.length, differsFromFactory })) welcome.show();
    });
  });
  // Settings' Tour button: close Settings, focus back on the gear (the tour hands focus there afterwards), start.
  function startTour(): void { settings.setOpen(false); gear?.focus(); tour.start(); }
  // The tour's last step: the dump overlay with SndA, as the Connections column opens it.
  function getSetups(): void { dumpGuide.choose('all'); dumpGuide.show(); }
  let keysFromSettings = false;
  function showKeys(): void { keysFromSettings = true; settings.setOpen(false); keysOpen = true; }
  // The key help opened from Settings hands focus back to the gear (the button it came from is gone).
  function closeKeys(): void { keysOpen = false; if (keysFromSettings) { keysFromSettings = false; void tick().then(() => { gear?.focus(); }); } }

  // Esc leaves edit mode (decision 21), unless something else is using the key: a field, a dialog, the settings.
  // A copy that is held ends first (plan 0006 decision 30): the first Esc stops pasting, the next leaves edit mode.
  function leaveEditMode(e: KeyboardEvent): void {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (mapFlow.armed !== null && !(e.target instanceof Element && e.target.closest('dialog, [role="dialog"]'))) { mapFlow.cancel(); return; }
    if (e.target instanceof Element && e.target.closest('input, select, textarea, [contenteditable], dialog, [role="dialog"]')) return;
    if (copyHold.held) { copyHold.stop(); return; }
    if (!store?.state.selection.control) return;
    store.selectControl(null);
  }
  // Copy and paste keys (decision 34), by the area that has the focus; in a text field they stay text keys.
  function copyKeys(e: KeyboardEvent): void {
    if (!store || e.defaultPrevented || isTextTarget(e.target)) return;
    if (e.target instanceof Element && e.target.closest('dialog, [role="dialog"]')) return;
    const action = copyKey(e, settings.keys === 'vim');
    if (!action) return;
    const level = levelOf(e.target, !!store.state.selection.control);
    if (!level) return;
    e.preventDefault();
    if (action === 'copy') copyHold.copy(level); else copyHold.paste(level);
  }
  // A click on empty ground in the device view leaves edit mode; a control, a button or the drawn buttons do not.
  function deviceClick(e: MouseEvent): void {
    if (!(e.target instanceof Element)) return;
    // Armed Map: a click on empty space cancels it (a click on a control maps it, handled by the control).
    if (mapFlow.armed !== null && !e.target.closest('[data-control], button, [role="button"]')) { mapFlow.cancel(); return; }
    if (!store?.state.selection.control) return;
    if (e.target.closest('[data-control], button, [role="button"]')) return;
    store.selectControl(null);
  }

  const editing = $derived(!!store?.state.selection.control);
  const propsHelp = $derived(editing
    ? 'Property panel: the selected control\'s properties · Esc leaves edit mode (outside a field)'
    : 'Property panel: empty until you select a control · click one on the device view');
  const deviceHelp = $derived(editing
    ? 'Device view, edit mode: the selected control is edited in the property panel · Esc leaves edit mode · UC4: the Edit LED is lit'
    : 'Device view: the drawn UC4 · click a control to edit it');
  const listHelp = 'Setup list: the setups of the library, shown on the device · ↑ ↓ select a setup';

  const IDLE = 'Click a control to edit it · ? shows all keys · the book opens the guide · changes are saved automatically';
  // A state message (problem, refused change, lowered number) overrides the element's help.
  const helpLine = $derived.by(() => {
    if (!store) return openError ?? 'Opening your library…';
    const state = store.state;
    // A save failure outranks a note about a file action.
    if (state.saveStatus === 'failed' && state.message) return state.message;
    return store.startMessage ?? state.message ?? help.text() ?? IDLE;
  });
</script>

<svelte:window onkeydown={(e) => { globalKeys(e); leaveEditMode(e); copyKeys(e); }} />
<svelte:document onpointerdown={(e) => { active.note(e.target); }} onfocusin={(e) => { active.note(e.target); active.noteFocus(e.target); }} onfocusout={() => { queueMicrotask(() => { active.noteFocus(document.activeElement); }); }} />

<div class="app" class:conn-open={connOpen} style:--list-width="{listWidth}px" style:--list-min="{LIST_WIDTH.min}px">
  <header class="top"><h1>UC4 Editor</h1>{#if store}<Toolbar {store} {confirm} />{/if}
    <a class="gear book" href={GUIDE_URL} target="_blank" rel="noopener" aria-label="User guide" title="User guide"
      data-help="User guide: how the editor works, in a new tab"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 7v14" /><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" /></svg></a>
    <button type="button" class="gear" data-settings-toggle bind:this={gear} aria-label="Settings" aria-expanded={settings.open}
      data-help="Settings: theme, keys and slide speed · Cmd-," onclick={() => { settings.toggle(); }}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg></button>
  </header>
  <ConnectionsColumn bind:this={column} {live} onselectmatch={showMatch} onsenddump={() => { dumpGuide.show(); }} {device} profile={faderfoxUc4} {store} {confirm} queue={notices.queue} open={connOpen} onopen={setConnOpen} {arrivals}
    onreview={review} onexport={exportNotice} ondismiss={(n) => { notices.remove(n.dumpId); }} />
  <SettingsPanel {settings} opener={() => gear} onallkeys={showKeys} ontour={startTour} />
  <KeysHelp open={keysOpen} vim={settings.keys === 'vim'} onclose={closeKeys} />
  <aside class="props" data-area="properties" data-copy-level="control" data-help={propsHelp} inert={(connOpen && !wide) || sender.dialog !== null}>{#if store}<PropertyPanel {store} {confirm} />{/if}</aside>
  <!-- Esc is the keyboard way out; the click is the pointer's. -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <main class="centre" data-area="device" data-copy-level="control" data-help={deviceHelp} onclick={deviceClick}>{#if store}<DeviceView {store} />{/if}</main>
  <ListResizeHandle width={shownWidth > 0 ? shownWidth : listWidth} onresize={(w) => { listWidth = w; }} oncommit={saveWidth} />
  <aside class="list" bind:offsetWidth={shownWidth} data-area="setups" data-copy-level="setup" data-help={listHelp}>{#if store}<LibraryList {store} {confirm} {device} {sender} profile={faderfoxUc4} />{/if}</aside>
  <ConfirmDialog {confirm} />
  {#if store}<SendDialog {store} {device} {sender} profile={faderfoxUc4} />{/if}
  <TourOverlay {tour} onget={getSetups} profile={faderfoxUc4} />
  <WelcomeCard {welcome} profile={faderfoxUc4} />
  {#if store}<DumpGuide {dumpGuide} {device} {sender} profile={faderfoxUc4} />{/if}
  <StatusBar help={helpLine} state={store?.state ?? null} problemAt={store?.problemAt ?? -1} onstep={(d) => store?.stepProblem(d)} switchUi={connOpen ? null : switchUi} warnings={store?.warnings ?? []} warningAt={store?.warningAt ?? -1} onstepwarning={(d) => store?.stepWarning(d)}
    waiting={notices.queue.length} onopenconnections={openConnections} />
</div>

<style>
  .app {
    /* The device view always fits: the list gives way first, down to its minimum, and the stored width is not touched, so
       it comes back on a wider window. --device-min = panel 448 + arrows 52 + the centre's side padding; --scrollbar is
       room for a vertical scrollbar beside it. */
    --rail-col: 48px; --props-col: 288px; --split-col: 4px; --left-col: var(--rail-col);
    --device-min: 508px; --scrollbar: 20px;
    --list-col: min(var(--list-width, 192px), max(var(--list-min, 160px),
      calc(100vw - var(--left-col) - var(--props-col) - var(--split-col) - var(--device-min) - var(--scrollbar))));
    display: grid; height: 100%;
    grid-template-columns: var(--left-col) var(--props-col) minmax(0, 1fr) var(--split-col) var(--list-col);
    grid-template-rows: 40px minmax(0, 1fr) 36px;
    grid-template-areas: 'top top top top top' 'conn props centre split list' 'foot foot foot foot foot';
  }
  /* 1320 = WIDE_PX in connections.ts: the Connections column is a real column from there. */
  @media (min-width: 1320px) { .app.conn-open { --left-col: 320px; } }
  @media (min-width: 1100px) { .app { --device-min: 516px; } .centre { padding-inline: var(--space-2); } }
  .app > :global(footer) { grid-area: foot; }
  .app > :global(.handle) { grid-area: split; }
  .top { grid-area: top; display: flex; align-items: center; padding: 0 var(--space-4); border-bottom: 1px solid var(--border); background: var(--surface); }
  .gear { margin-left: var(--space-2); width: var(--target); min-height: var(--target); display: inline-flex; align-items: center; justify-content: center; padding: 0; color: var(--text); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  .book { text-decoration: none; }
  .gear:hover { background: var(--accent-soft); }
  .gear:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  h1 { margin: 0 auto 0 0; font-size: var(--text-lg); }
  .list { grid-area: list; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--border) transparent; background: var(--surface); }
  .centre { grid-area: centre; overflow: auto; padding: var(--space-3) var(--space-1); container-type: size; scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
  .props { grid-area: props; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--border) transparent; background: var(--surface); border-right: 1px solid var(--border); }
</style>
