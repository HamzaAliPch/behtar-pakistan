"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser, requireRole } from "@/lib/auth/session";
import { allowRequest } from "@/lib/rate-limit";
import { configureWallet, recordExpense, reviewDonation, saveCampaign, submitDonation } from "@/lib/donations";
import { OperationError } from "@/lib/operations/common";
import { publicDonationsEnabled } from "@/lib/donation-availability";

function value(form: FormData, key: string): string { return String(form.get(key) ?? ""); }
function fail(path: string, error: unknown): never { const code = error instanceof OperationError ? error.code : "invalid"; redirect(`${path}${path.includes("?") ? "&" : "?"}error=${code}`); }

export async function submitDonationAction(form: FormData) {
  if (!publicDonationsEnabled()) redirect("/donate?error=disabled");
  if (value(form, "company")) redirect("/donate?error=invalid");
  const h = await headers();
  const identity = (h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local").slice(0, 80);
  if (!allowRequest("donation:global", 100, 10 * 60_000) || !allowRequest(`donation:${identity}`, 5, 10 * 60_000)) redirect("/donate?error=conflict");
  const user = await getCurrentUser();
  const file = form.get("receipt");
  try {
    const intent = await submitDonation({ campaignId: value(form, "campaignId"), walletId: value(form, "walletId"), amount: value(form, "customAmount").trim() || value(form, "amount"), transactionReference: value(form, "transactionReference"), donorName: value(form, "donorName"), donorEmail: value(form, "donorEmail"), donorPhone: value(form, "donorPhone"), receipt: file instanceof File ? file : null, donorUserId: user?.id });
    redirect(`/donate/thanks?code=${encodeURIComponent(intent.code)}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    fail("/donate", error);
  }
}

export async function configureWalletAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  try { await configureWallet(actor, { method: value(form, "method"), accountNumber: value(form, "accountNumber"), accountTitle: value(form, "accountTitle"), instructions: value(form, "instructions"), enabled: value(form, "enabled") === "1", confirmed: value(form, "confirmed") === "on" }); }
  catch (error) { fail("/admin/donations/settings", error); }
  revalidatePath("/donate"); revalidatePath("/admin/donations/settings"); redirect("/admin/donations/settings");
}

export async function saveCampaignAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  try { await saveCampaign(actor, { id: value(form, "id") || undefined, slug: value(form, "slug"), title: value(form, "title"), description: value(form, "description"), goalPkr: value(form, "goalPkr"), complaintId: value(form, "complaintId"), verificationNote: value(form, "verificationNote"), status: value(form, "status") }); }
  catch (error) { fail("/admin/donations/campaigns", error); }
  revalidatePath("/donate"); revalidatePath("/transparency"); redirect("/admin/donations/campaigns");
}

export async function reviewDonationAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  try { await reviewDonation(actor, value(form, "id"), value(form, "decision"), value(form, "accountCheckNote"), value(form, "independentlyChecked") === "on"); }
  catch (error) { fail("/admin/donations", error); }
  revalidatePath("/admin/donations"); revalidatePath("/transparency"); redirect("/admin/donations");
}

export async function recordExpenseAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  try { await recordExpense(actor, { campaignId: value(form, "campaignId"), amount: value(form, "amount"), purpose: value(form, "purpose"), documentation: value(form, "documentation"), spentAt: value(form, "spentAt"), publish: value(form, "publish") === "on" }); }
  catch (error) { fail("/admin/donations/expenses", error); }
  revalidatePath("/admin/donations/expenses"); revalidatePath("/transparency"); redirect("/admin/donations/expenses");
}
