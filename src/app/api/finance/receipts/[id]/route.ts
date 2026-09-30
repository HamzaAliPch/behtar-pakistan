import { privateStoragePath } from "@/lib/private-storage";
import { readFile } from "node:fs/promises";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") return new Response("Not found", { status: 404 });
  const { id } = await params;
  const expense = await prisma.donationExpense.findUnique({ where: { id }, select: { receiptKey: true, receiptMime: true } });
  if (!expense?.receiptKey || !/^[a-f0-9]{40}\.(jpg|png|webp)$/.test(expense.receiptKey)) return new Response("Not found", { status: 404 });
  try {
    const bytes = await readFile(privateStoragePath("expense_receipts", expense.receiptKey));
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": expense.receiptMime ?? "application/octet-stream", "Content-Disposition": "inline; filename=expense-receipt", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" } });
  } catch { return new Response("Not found", { status: 404 }); }
}
