import { readFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { donationReceiptDirectory } from "@/lib/donations";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") return new Response("Not found", { status: 404 });
  const { id } = await params;
  const intent = await prisma.donationIntent.findUnique({ where: { id }, select: { receiptKey: true, receiptMime: true } });
  if (!intent?.receiptKey || !/^[a-f0-9]{40}\.(jpg|png|webp)$/.test(intent.receiptKey) || !["image/jpeg", "image/png", "image/webp"].includes(intent.receiptMime ?? "")) return new Response("Not found", { status: 404 });
  try {
    const bytes = await readFile(path.join(donationReceiptDirectory, intent.receiptKey));
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": intent.receiptMime!, "Content-Length": String(bytes.length), "Content-Disposition": "inline; filename=donation-receipt", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox" } });
  } catch { return new Response("Not found", { status: 404 }); }
}
