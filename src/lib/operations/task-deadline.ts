// The guided form uses an explicit local date/time format. Existing ISO values
// remain accepted by other task creation callers.
export function parseTaskDeadline(value: string, now = new Date()): Date | null {
  const input = value.trim();
  const local = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(input);
  let date: Date;
  if (local) {
    const [, year, month, day, hour, minute] = local.map(Number);
    const wall = new Date(Date.UTC(year, month - 1, day, hour, minute));
    if (wall.getUTCFullYear() !== year || wall.getUTCMonth() !== month - 1 || wall.getUTCDate() !== day || wall.getUTCHours() !== hour || wall.getUTCMinutes() !== minute) return null;
    date = new Date(wall.getTime() - 5 * 60 * 60 * 1000); // Pakistan Standard Time (UTC+05:00)
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(input)) {
    date = new Date(input);
  } else return null;
  return Number.isFinite(date.getTime()) && date > now ? date : null;
}
