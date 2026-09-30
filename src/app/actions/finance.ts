"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { approveFinanceCorrection, markExpensePaid, proposeExpense, proposeFinanceCorrection, publishPaidExpense, reviewExpense } from "@/lib/finance-operations";
import { OperationError } from "@/lib/operations/common";

const value = (form: FormData, key: string) => String(form.get(key) ?? "");
const fail = (error: unknown): never => redirect(`/admin/finance?error=${error instanceof OperationError ? error.code : "invalid"}`);
const done = (): never => { revalidatePath("/funds"); revalidatePath("/admin/finance"); redirect("/admin/finance"); };

export async function proposeFinanceExpenseAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  try { await proposeExpense(actor, { campaignId: value(form, "campaignId"), complaintId: value(form, "complaintId"), amount: value(form, "amount"), purpose: value(form, "purpose"), documentation: value(form, "documentation"), receipt: form.get("receipt") instanceof File ? form.get("receipt") as File : null }); }
  catch (error) { fail(error); }
  done();
}

export async function reviewFinanceExpenseAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  try { const decision = value(form, "decision"); if (decision !== "APPROVED" && decision !== "CANCELLED") throw new OperationError("invalid"); await reviewExpense(actor, value(form, "id"), decision); }
  catch (error) { fail(error); }
  done();
}

export async function payFinanceExpenseAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  try { await markExpensePaid(actor, value(form, "id"), value(form, "paidAt")); }
  catch (error) { fail(error); }
  done();
}

export async function publishFinanceExpenseAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  try { await publishPaidExpense(actor, value(form, "id")); }
  catch (error) { fail(error); }
  done();
}

export async function proposeFinanceCorrectionAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  try { await proposeFinanceCorrection(actor, value(form, "expenseId"), value(form, "deltaPkr"), value(form, "reason")); }
  catch (error) { fail(error); }
  done();
}

export async function approveFinanceCorrectionAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  try { await approveFinanceCorrection(actor, value(form, "id")); }
  catch (error) { fail(error); }
  done();
}
