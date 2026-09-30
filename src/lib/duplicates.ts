import { prisma } from "@/lib/prisma";
import { distanceKm, type Point } from "@/lib/geo";
import { normalizeArea } from "@/lib/karachi-areas";
import { audit, event, OperationError, type Actor } from "@/lib/operations/common";
import { assertCityAccess, requireCaseOperator } from "@/lib/operations/city-access";

const inactive = ["RESOLVED", "REJECTED"];
const generic = new Set(["qa", "test", "the", "and", "near", "with", "from", "this", "that", "issue", "problem", "please", "broken", "working", "road", "street", "light", "streetlight", "water", "drainage", "garbage"]);
function tokens(value: string) { return new Set((value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(word => word.length >= 2 && !generic.has(word))); }
function numbers(value: string) { return new Set(value.match(/\b\d+\b/g) ?? []); }
export function duplicateScore(input: { title: string; description: string; category: string; district: string; area: string; point?: Point | null }, candidate: { title: string; category: string; district: string | null; area: string; point?: Point | null }) {
  if (input.category !== candidate.category || input.district !== candidate.district) return { score: 0, likelySameIssue: false };
  const distance = input.point && candidate.point ? distanceKm(input.point, candidate.point) : null;
  // A moderated public area may include a qualifier (for example "QA area").
  // Match its named locality, but never substitute the complaint's private area.
  const inputArea = normalizeArea(input.area), publicArea = normalizeArea(candidate.area);
  const areaMatch = inputArea === publicArea || (inputArea.length >= 5 && publicArea.startsWith(`${inputArea} `));
  if (!areaMatch && (distance == null || distance > 1.5)) return { score: 0, likelySameIssue: false };
  const query = tokens(`${input.title} ${input.description}`), target = tokens(candidate.title);
  const overlap = [...target].filter(word => query.has(word)).length;
  const similarity = target.size ? overlap / target.size : 0;
  const inputNumbers = numbers(`${input.title} ${input.description}`), targetNumbers = numbers(candidate.title);
  const conflictingIdentifiers = inputNumbers.size > 0 && targetNumbers.size > 0 && ![...inputNumbers].some(number => targetNumbers.has(number));
  const score = Math.max(0, Math.min(100, 25 + (areaMatch ? 20 : 15) + Math.round(similarity * 55) - (conflictingIdentifiers ? 60 : 0)));
  return { score, likelySameIssue: !conflictingIdentifiers && overlap > 0 && score >= 60 };
}

export async function publicDuplicateSuggestions(input: { cityId: string; title: string; description: string; category: string; district: string; area: string; point?: Point | null }) {
  const rows = await prisma.complaint.findMany({ where: {
    publicVisible: true, publicApprovedAt: { not: null }, publicTitle: { not: null }, publicArea: { not: null },
    category: input.category, district: input.district, status: { not: "REJECTED" },
    cityId: input.cityId,
  }, select: { id: true, publicTitle: true, publicArea: true, category: true, district: true, status: true, publicLatitude: true, publicLongitude: true }, orderBy: { updatedAt: "desc" }, take: 200 });
  return rows.flatMap(row => {
    const point = row.publicLatitude != null && row.publicLongitude != null ? { latitude: row.publicLatitude, longitude: row.publicLongitude } : null;
    const match = duplicateScore(input, { title: row.publicTitle!, category: row.category, district: row.district, area: row.publicArea!, point });
    if (match.score === 0) return [];
    return [{ id: row.id, title: row.publicTitle!, area: row.publicArea!, category: row.category, status: row.status, score: match.score,
      likelySameIssue: !inactive.includes(row.status) && match.likelySameIssue,
      distanceKm: input.point && point ? Math.round(distanceKm(input.point, point) * 10) / 10 : null }];
  }).sort((a, b) => Number(b.likelySameIssue) - Number(a.likelySameIssue) || b.score - a.score).slice(0, 5);
}

export async function submissionDuplicateCandidates(input: Parameters<typeof publicDuplicateSuggestions>[0]) {
  const suggestions = await publicDuplicateSuggestions(input);
  const candidates = suggestions.filter(item => item.likelySameIssue);
  if (candidates.length) return { candidates, reason: "PENDING_REVIEW" as const };
  const eligibleActivePartners = await prisma.complaint.count({ where: {
    cityId: input.cityId, category: input.category, district: input.district,
    status: { notIn: inactive }, publicVisible: true, publicApprovedAt: { not: null },
    publicTitle: { not: null }, publicArea: { not: null },
  } });
  return { candidates, reason: eligibleActivePartners ? "NO_SIMILAR_ACTIVE_PARTNER" as const : "NO_ELIGIBLE_ACTIVE_PARTNER" as const };
}

export function detectorHistoryState(run: { reason?: string; candidateCount?: number } | null, linkStatuses: string[]) {
  if (linkStatuses.includes("LINKED")) return "Linked";
  if (linkStatuses.includes("SUGGESTED")) return "Pending review";
  if (linkStatuses.length && linkStatuses.every(status => status === "REJECTED")) return "Reviewed / rejected";
  if (linkStatuses.includes("UNLINKED")) return "Unlinked";
  if (!run) return "Never ran";
  if (run.reason === "NO_ELIGIBLE_ACTIVE_PARTNER") return "No eligible active public partner";
  if (run.reason === "NO_SIMILAR_ACTIVE_PARTNER") return "No sufficiently similar active partner";
  return run.candidateCount ? "Candidate review pending" : "Completed (reason not recorded)";
}

export async function reviewCaseLink(actor: Actor, linkId: string, decision: "LINKED" | "REJECTED" | "UNLINKED", reason: string) {
  requireCaseOperator(actor);
  const clean = reason.trim();
  if (clean.length < 5 || clean.length > 500) throw new OperationError("invalid");
  return prisma.$transaction(async tx => {
    const link = await tx.caseLink.findUnique({ where: { id: linkId }, include: { sourceComplaint: { select: { cityId: true, reference: true, userId: true, status: true } }, targetComplaint: { select: { cityId: true, reference: true, status: true } } } });
    if (!link) throw new OperationError("not_found");
    await assertCityAccess(tx, actor, link.sourceComplaint.cityId);
    await assertCityAccess(tx, actor, link.targetComplaint.cityId);
    if (link.sourceComplaint.cityId !== link.targetComplaint.cityId) throw new OperationError("forbidden");
    if (decision === "LINKED" && (inactive.includes(link.sourceComplaint.status) || inactive.includes(link.targetComplaint.status))) throw new OperationError("conflict");
    if (decision === "UNLINKED" ? link.status !== "LINKED" : link.status !== "SUGGESTED" && link.status !== "REJECTED" && link.status !== "UNLINKED") throw new OperationError("conflict");
    if (decision === "LINKED" && await tx.caseLink.count({ where: { sourceComplaintId: link.sourceComplaintId, status: "LINKED", id: { not: link.id } } })) throw new OperationError("conflict");
    await tx.caseLink.update({ where: { id: link.id }, data: { status: decision, reviewerId: actor.id, reviewedAt: new Date(), reason: clean } });
    await event(tx, { complaintId: link.sourceComplaintId, actorId: actor.id, kind: `CASE_LINK_${decision}`, summary: `${decision === "LINKED" ? "Related to" : decision === "UNLINKED" ? "Unlinked from" : "Duplicate suggestion rejected for"} ${link.targetComplaint.reference}: ${clean}`, visibility: "INTERNAL" });
    await audit(tx, actor.id, `CASE_LINK_${decision}`, "CaseLink", link.id, clean);
    if (link.sourceComplaint.userId) await tx.notification.create({ data: { userId: link.sourceComplaint.userId, complaintId: link.sourceComplaintId, title: "Case relationship reviewed", message: `Your report ${link.sourceComplaint.reference} was reviewed alongside another report. Your own case remains open for individual updates and resolution confirmation.`, href: `/track?ref=${encodeURIComponent(link.sourceComplaint.reference)}` } });
    return decision;
  });
}

export async function setComplaintSupport(actor: Actor, complaintId: string, active: boolean) {
  if (actor.role !== "CITIZEN" && actor.role !== "VOLUNTEER") throw new OperationError("forbidden");
  return prisma.$transaction(async tx => {
    const complaint = await tx.complaint.findUnique({ where: { id: complaintId }, select: { id: true, userId: true, publicVisible: true, status: true, city: { select: { status: true } } } });
    if (!complaint || !complaint.publicVisible || complaint.status === "REJECTED" || (complaint.city && complaint.city.status !== "ACTIVE")) throw new OperationError("not_found");
    if (complaint.userId === actor.id) throw new OperationError("forbidden");
    const existing = await tx.complaintSupport.findUnique({ where: { userId_complaintId: { userId: actor.id, complaintId } } });
    if (existing?.active === active) return active;
    await tx.complaintSupport.upsert({ where: { userId_complaintId: { userId: actor.id, complaintId } }, create: { userId: actor.id, complaintId, active }, update: { active } });
    await audit(tx, actor.id, active ? "CASE_SUPPORTED" : "CASE_SUPPORT_REMOVED", "Complaint", complaintId);
    return active;
  });
}
