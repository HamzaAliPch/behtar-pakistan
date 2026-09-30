const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Karachi", day: "numeric", month: "short", year: "numeric",
  hour: "numeric", minute: "2-digit", hour12: true,
});

export function formatPakistanDateTime(value: Date): string {
  return `${formatter.format(value)} PKT`;
}
