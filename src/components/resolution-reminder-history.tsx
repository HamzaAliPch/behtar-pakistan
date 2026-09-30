import { formatPakistanDateTime } from "@/lib/pakistan-time";

type Reminder = { id: string; dueAt: Date; deliveredAt: Date | null; status: string };

export function ResolutionReminderHistory({ reminders }: { reminders: Reminder[] }) {
  if (!reminders.length) return null;
  return <section className="surface-card" aria-label="Resolution reminder history">
    <h2 className="text-xl font-bold">Resolution reminders</h2>
    <p className="mt-2 text-sm text-slate-600">These reminders ask you to review a proposed resolution. Your case will not close because you have not replied.</p>
    <ol className="mt-4 space-y-2 text-sm">{reminders.map(item => <li key={item.id} className="rounded-lg bg-slate-50 p-3">
      {item.status === "DELIVERED" && item.deliveredAt ? `Added to your in-app notifications on ${formatPakistanDateTime(item.deliveredAt)}` : item.status === "CANCELLED" ? `Cancelled — previously scheduled for ${formatPakistanDateTime(item.dueAt)}` : item.status === "BLOCKED" ? `Could not add the reminder scheduled for ${formatPakistanDateTime(item.dueAt)}` : `Scheduled for ${formatPakistanDateTime(item.dueAt)}`}
    </li>)}</ol>
    <p className="mt-3 text-xs text-slate-500">SMS and WhatsApp delivery, if separately enabled, is shown in your private profile. Scheduled reminders are not delivered messages.</p>
  </section>;
}
