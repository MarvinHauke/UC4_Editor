import { mount } from 'svelte';
import './app/tokens.css';
import App from './app/App.svelte';
import { indexedDbAvailable, indexedDbStorage, memoryStorage, openLibrary } from './storage/index.ts';

const target = document.getElementById('app');
if (!target) throw new Error('index.html has no #app element');

// The page shows at once; the library arrives when storage has answered. Without IndexedDB the editor
// still works, kept in memory until the tab closes.
const idb = indexedDbAvailable();
const opening = openLibrary(idb ? indexedDbStorage() : memoryStorage()).then((opened) => ({
  ...opened,
  ...(!idb && !opened.message
    ? { message: 'This browser has no local storage for the editor: your changes are kept only until you close the tab.' }
    : {}),
}));

export default mount(App, { target, props: { opening } });
