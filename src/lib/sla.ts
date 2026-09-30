import { prisma } from "@/lib/prisma";
import { categories } from "@/lib/complaints";
import { assertCityAccess, requireCaseOperator } from "@/lib/operations/city-access";
import { audit, OperationError, type Actor, type Tx } from "@/lib/operations/common";

const hour = 3_600_000;
export { formatPakistanDateTime as karachiTime } from "@/lib/pakistan-time";
export function targetAt(start: Date, hours: number): Date { return new Date(start.getTime() + hours * hour); }

export async function snapshotSlaAtSubmission(tx: Tx, complaint: { id: string; cityId: string | null; category: string; createdAt: Date }) {
  const policy = complaint.cityId ? await tx.slaPolicy.findFirst({ where: { cityId: complaint.cityId, active: true, category: { in: [complaint.category, "ALL"] } }, orderBy: [{ category: "desc" }, { version: "desc" }] }) : null;
  // A snapshot without targets is deliberate: a later policy never rewrites history.
  return tx.complaintSlaSnapshot.create({ data: { complaintId: complaint.id, policyId: policy?.id, policyVersion: policy?.version,
    firstReviewTargetAt: policy ? targetAt(complaint.createdAt, policy.firstReviewHours) : null,
    verificationTargetAt: policy ? targetAt(complaint.createdAt, policy.verificationHours) : null,
    resolutionTargetAt: policy ? targetAt(complaint.createdAt, policy.resolutionHours) : null } });
}

export async function recordSlaMilestone(tx: Tx, complaintId: string, status: string, at = new Date()) {
  const snapshot = await tx.complaintSlaSnapshot.findUnique({ where: { complaintId } });
  if (!snapshot) return; // Historical cases keep their original, undefined targets.
  const data = status === "UNDER_REVIEW" && !snapshot.firstReviewedAt ? { firstReviewedAt: at }
    : ["VERIFIED", "ASSIGNED"].includes(status) && !snapshot.verifiedOrAssignedAt ? { verifiedOrAssignedAt: at }
    : status === "RESOLUTION_PROPOSED" && !snapshot.resolutionProposedAt ? { resolutionProposedAt: at } : null;
  if (data) await tx.complaintSlaSnapshot.update({ where: { complaintId }, data });
}

export type SlaStage = { label: string; target: Date | null; actual: Date | null; state: "UNDEFINED" | "DONE" | "DONE_LATE" | "APPROACHING" | "OVERDUE" | "ON_TRACK" };
export function slaStages(snapshot: { firstReviewTargetAt: Date | null; verificationTargetAt: Date | null; resolutionTargetAt: Date | null; firstReviewedAt: Date | null; verifiedOrAssignedAt: Date | null; resolutionProposedAt: Date | null } | null, now = new Date()): SlaStage[] {
  return ([
    ["First review", snapshot?.firstReviewTargetAt ?? null, snapshot?.firstReviewedAt ?? null],
    ["Verification or assignment", snapshot?.verificationTargetAt ?? null, snapshot?.verifiedOrAssignedAt ?? null],
    ["Proposed resolution", snapshot?.resolutionTargetAt ?? null, snapshot?.resolutionProposedAt ?? null],
  ] as const).map(([label, target, actual]) => ({ label, target, actual, state: actual ? target && actual > target ? "DONE_LATE" : "DONE" : !target ? "UNDEFINED" : target < now ? "OVERDUE" : target.getTime() - now.getTime() <= 24 * hour ? "APPROACHING" : "ON_TRACK" }));
}

export async function approveSlaPolicy(actor: Actor, cityId: string, category: string, firstReviewHours: number, verificationHours: number, resolutionHours: number) {
  requireCaseOperator(actor);
  if (!cityId || !["ALL", ...categories].includes(category) || ![firstReviewHours, verificationHours, resolutionHours].every(value => Number.isInteger(value) && value >= 1 && value <= 8760) || firstReviewHours > verificationHours || verificationHours > resolutionHours) throw new OperationError("invalid");
  return prisma.$transaction(async tx => {
    const city = await tx.city.findUnique({ where: { id: cityId }, select: { status: true } });
    if (city?.status !== "ACTIVE") throw new OperationError("invalid");
    await assertCityAccess(tx, actor, cityId);
    const prior = await tx.slaPolicy.findFirst({ where: { cityId, category }, orderBy: { version: "desc" } });
    await tx.slaPolicy.updateMany({ where: { cityId, category, active: true }, data: { active: false } });
    const policy = await tx.slaPolicy.create({ data: { cityId, category, version: (prior?.version ?? 0) + 1, firstReviewHours, verificationHours, resolutionHours, approvedById: actor.id } });
    await audit(tx, actor.id, "SLA_POLICY_APPROVED", "SlaPolicy", policy.id, `${category} version ${policy.version}`);
    return policy;
  });
}
