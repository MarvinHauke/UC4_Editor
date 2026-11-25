// Hands a file the library made to the browser as a download. The library only makes name and text.
import type { ExportFile } from '../storage/index.ts';

function save(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => { URL.revokeObjectURL(url); }, 1000);
}

export const download = (file: ExportFile): void => { save(file.name, new Blob([file.text], { type: 'application/json' })); };

/** Hands bytes to the browser exactly as they are (a kept `.syx` dump). */
export const downloadBytes = (name: string, bytes: Uint8Array): void => { save(name, new Blob([bytes as BlobPart], { type: 'application/octet-stream' })); };
