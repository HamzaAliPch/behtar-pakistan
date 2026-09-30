import { readFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { canReadEvidence, evidenceDirectory } from "@/lib/operations/evidence";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const evidence = await prisma.evidence.findUnique({ where: { id }, include: { complaint: { select: { userId: true, cityId: true } }, task: { select: { assigneeId: true } } } });
  if (!evidence) return new Response("Not found", { status: 404 });
  const user = await getCurrentUser();
  if (!await canReadEvidence(user, evidence)) return new Response("Not found", { status: 404 });
  if (!/^[a-f0-9]{40}\.(jpg|png|webp|mp4|webm)$/.test(evidence.storageKey)) return new Response("Not found", { status: 404 });
  if (!["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"].includes(evidence.mimeType)) return new Response("Not found", { status: 404 });
  try {
    const bytes = await readFile(path.join(evidenceDirectory, evidence.storageKey));
    const video = evidence.mimeType.startsWith("video/");
    const headers = { "Content-Type": evidence.mimeType, "Content-Disposition": "inline; filename=evidence", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store", ...(video ? { "Accept-Ranges": "bytes" } : {}) };
    const range = video ? request.headers.get("range") : null;
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!match) return new Response("Invalid range", { status: 416, headers: { "Content-Range": `bytes */${bytes.length}` } });
      const start = Number(match[1]), requestedEnd = match[2] ? Number(match[2]) : bytes.length - 1;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start >= bytes.length || requestedEnd < start) return new Response("Invalid range", { status: 416, headers: { "Content-Range": `bytes */${bytes.length}` } });
      const end = Math.min(requestedEnd, start + 2 * 1024 * 1024 - 1, bytes.length - 1), chunk = bytes.subarray(start, end + 1);
      return new Response(new Uint8Array(chunk), { status: 206, headers: { ...headers, "Content-Length": String(chunk.length), "Content-Range": `bytes ${start}-${end}/${bytes.length}` } });
    }
    return new Response(new Uint8Array(bytes), { headers: { ...headers, "Content-Length": String(bytes.length) } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
