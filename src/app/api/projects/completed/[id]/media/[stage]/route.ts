import { privateStoragePath } from "@/lib/private-storage";
import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { getPublishedStory } from "@/lib/completed-work-public";

export const dynamic = "force-dynamic";
const mime: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; stage: string }> }) {
  const { id, stage } = await params;
  if (stage !== "before" && stage !== "after") return new Response("Not found", { status: 404 });
  const story = await getPublishedStory(id, false);
  if (!story) return new Response("Not found", { status: 404 });
  const evidenceId = stage === "before" ? story.beforeEvidenceId : story.afterEvidenceId;
  const file = await prisma.evidence.findFirst({ where: { id: evidenceId, complaintId: story.complaintId, publicApprovedAt: { not: null } }, select: { storageKey: true, mimeType: true } });
  if (!file || !mime[file.mimeType] || !new RegExp(`^[a-f0-9]{40}\\.${mime[file.mimeType]}$`, "i").test(file.storageKey)) return new Response("Not found", { status: 404 });
  try {
    const bytes = await readFile(privateStoragePath(file.storageKey));
    return new Response(bytes, { headers: { "Content-Type": file.mimeType, "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" } });
  } catch { return new Response("Not found", { status: 404 }); }
}
