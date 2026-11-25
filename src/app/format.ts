/** "2026-11-14 15:30" in local time, or "never" (the status bar's "last exported: …"). */
export function formatExported(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'never';
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "SE01": a setup slot as the device shows it. */
export const slotName = (n: number): string => `SE${String(n).padStart(2, '0')}`;
