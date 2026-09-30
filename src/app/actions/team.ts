"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { updateTeamProfile, setVolunteerActive } from "@/lib/operations/team";
import { addTaskNote } from "@/lib/operations/tasks";
import { OperationError } from "@/lib/operations/common";

const value = (form: FormData, key: string) => String(form.get(key) ?? "");
const fail = (error: unknown): never => redirect(`/admin/team?error=${error instanceof OperationError ? error.code : "unexpected"}`);
const done = (): never => { revalidatePath("/admin/team"); revalidatePath("/admin/tasks"); redirect("/admin/team"); };

export async function updateTeamProfileAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  try { await updateTeamProfile(actor, value(form, "id"), { district: value(form, "district"), serviceArea: value(form, "serviceArea"), availability: value(form, "availability"), skills: value(form, "skills") }); }
  catch (error) { fail(error); }
  done();
}

export async function setTeamActiveAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  try { await setVolunteerActive(actor, value(form, "id"), value(form, "active") === "1"); }
  catch (error) { fail(error); }
  done();
}

export async function teamFieldNoteAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  try { await addTaskNote(actor, value(form, "taskId"), value(form, "note")); }
  catch (error) { fail(error); }
  done();
}
