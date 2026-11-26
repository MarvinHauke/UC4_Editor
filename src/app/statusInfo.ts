// The status bar holds one info at a time (plan 0008 decision 25): the switch offer, its "Switched to … · Back" note and the
// warning count take the same place, in this order. The exported-warnings note is its own thing and also hides the count.
export function showWarningCount(x: { warnings: number; offer: boolean; note: boolean; exportWarnings: number }): boolean {
  return x.warnings > 0 && !x.offer && !x.note && x.exportWarnings === 0;
}
