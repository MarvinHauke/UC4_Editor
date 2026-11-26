// The status bar holds one info at a time (plan 0008 decision 25): the switch offer, its "Switched to … · Back" note and the
// warning item take the same place, in this order. The exported-warnings note is its own thing and also hides the item. With no
// warnings the item still shows (decision 30), so the check stays reachable.
export function showWarningItem(x: { offer: boolean; note: boolean; exportWarnings: number }): boolean {
  return !x.offer && !x.note && x.exportWarnings === 0;
}

/** What the warning item of the status bar says (decision 30): it never goes away; ignored and factory-layout warnings count together. */
export function warningItem(open: number, ignored: number): { clear: boolean; text: string } {
  if (open > 0) return { clear: false, text: `${open} warning${open === 1 ? '' : 's'}` };
  return { clear: true, text: ignored > 0 ? `No warnings · ${ignored} ignored` : 'No warnings' };
}
