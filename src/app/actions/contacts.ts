"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { OperationError } from "@/lib/operations/common";
import { createContact, linkContactComplaint, linkContactProject, recordContactInteraction, updateContact } from "@/lib/operations/contacts";

const value = (form: FormData, key: string) => String(form.get(key) ?? "");
const pathFor = (form: FormData) => `/admin/contacts/${encodeURIComponent(value(form, "contactId"))}`;
async function run(path: string, work: () => Promise<unknown>): Promise<never> {
  try { await work(); }
  catch (error) { if (!(error instanceof OperationError)) console.error("Contact action failed", error); redirect(`${path}?error=${error instanceof OperationError ? error.code : "unexpected"}`); }
  revalidatePath(path); revalidatePath("/admin/contacts"); redirect(path);
}
const contactInput = (form: FormData) => ({ name: value(form, "name"), organization: value(form, "organization"), category: value(form, "category"), phone: value(form, "phone"), email: value(form, "email"), whatsapp: value(form, "whatsapp"), serviceArea: value(form, "serviceArea"), notes: value(form, "notes"), nextFollowUpAt: value(form, "nextFollowUpAt"), ownerId: value(form, "ownerId"), ngoId: value(form, "ngoId"), departmentId: value(form, "departmentId") });

export async function createContactAction(form: FormData) { const actor = await requireRole(["ADMIN"]); return run("/admin/contacts", () => createContact(actor, contactInput(form))); }
export async function updateContactAction(form: FormData) { const actor = await requireRole(["ADMIN"]); return run(pathFor(form), () => updateContact(actor, value(form, "contactId"), contactInput(form))); }
export async function recordContactInteractionAction(form: FormData) { const actor = await requireRole(["ADMIN"]); return run(pathFor(form), () => recordContactInteraction(actor, value(form, "contactId"), { channel: value(form, "channel"), summary: value(form, "summary"), happenedAt: value(form, "happenedAt"), nextFollowUpAt: value(form, "nextFollowUpAt") })); }
export async function linkContactComplaintAction(form: FormData) { const actor = await requireRole(["ADMIN"]); return run(pathFor(form), () => linkContactComplaint(actor, value(form, "contactId"), value(form, "complaintId"))); }
export async function linkContactProjectAction(form: FormData) { const actor = await requireRole(["ADMIN"]); return run(pathFor(form), () => linkContactProject(actor, value(form, "contactId"), value(form, "projectId"))); }
