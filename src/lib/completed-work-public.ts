import { prisma } from "@/lib/prisma";
import { getFinanceSnapshot } from "@/lib/finance";
import { activePublicCities, publicComplaintCityFilter } from "@/lib/public-cities";

export async function listPublishedStories(cityId: string | null = null) {
  const cities = await activePublicCities();
  if (cityId && !cities.some(city => city.id === cityId)) return [];
  return prisma.completedWorkStory.findMany({ where: { status: "PUBLISHED", manuallyWithdrawn: false, contentApprovedAt: { not: null }, complaint: { status: "RESOLVED", storyPublicApprovedAt: { not: null }, ...publicComplaintCityFilter(cityId, cities.map(item => item.id)) } }, select: {
    id: true, complaintId: true, completedAt: true, publishedAt: true,
    complaint: { select: { reference: true, publicTitle: true, publicArea: true, district: true, category: true, ngoProjects: { where: { publicApproved: true, ngo: { status: "ACTIVE", verifiedAt: { not: null } } }, select: { id: true, ngo: { select: { name: true } } }, take: 1 } } },
  }, orderBy: { publishedAt: "desc" } });
}

export async function getPublishedStory(id: string, withFunds = true) {
  const cities = await activePublicCities();
  const row = await prisma.completedWorkStory.findFirst({ where: { id, status: "PUBLISHED", manuallyWithdrawn: false, contentApprovedAt: { not: null }, complaint: { status: "RESOLVED", storyPublicApprovedAt: { not: null }, ...publicComplaintCityFilter(null, cities.map(item => item.id)) } }, select: {
    id: true, complaintId: true, problemSummary: true, workSummary: true, beforeEvidenceId: true, afterEvidenceId: true, completedAt: true,
    complaint: { select: { reference: true, publicTitle: true, publicArea: true, publicVisible: true, publicApprovedAt: true, publicLatitude: true, publicLongitude: true, district: true, category: true, status: true, createdAt: true,
      events: { where: { kind: "VERIFIED" }, select: { createdAt: true }, orderBy: { createdAt: "asc" }, take: 1 },
      ngoProjects: { where: { publicApproved: true, ngo: { status: "ACTIVE", verifiedAt: { not: null } } }, select: { id: true, title: true, campaignId: true, ngo: { select: { name: true } } }, take: 1 },
      donationCampaigns: { where: { approvedAt: { not: null }, status: { in: ["PUBLISHED", "CLOSED"] } }, select: { id: true, title: true }, take: 1 },
    } },
  } });
  if (!row || !row.problemSummary || !row.workSummary || !row.beforeEvidenceId || !row.afterEvidenceId || !row.completedAt || !row.complaint.publicTitle || !row.complaint.publicArea || !row.complaint.district) return null;
  const images = await prisma.evidence.findMany({ where: { id: { in: [row.beforeEvidenceId, row.afterEvidenceId] }, complaintId: row.complaintId, publicApprovedAt: { not: null }, mimeType: { in: ["image/jpeg", "image/png", "image/webp"] } }, select: { id: true, stage: true, publicApprovedAt: true } });
  if (!images.some(item => item.id === row.beforeEvidenceId && item.stage === "BEFORE") || !images.some(item => item.id === row.afterEvidenceId && item.stage === "AFTER")) return null;
  const project = row.complaint.ngoProjects[0] ?? null;
  const campaignId = project?.campaignId ?? row.complaint.donationCampaigns[0]?.id ?? null;
  const funds = withFunds && campaignId ? (await getFinanceSnapshot()).campaigns.find(item => item.id === campaignId) ?? null : null;
  const funded = funds && (funds.received - funds.refunded > 0 || funds.spent > 0) ? funds : null;
  return {
    id: row.id, complaintId: row.complaintId, title: row.complaint.publicTitle, reference: row.complaint.reference, district: row.complaint.district,
    publicMapCase: row.complaint.publicVisible && row.complaint.publicApprovedAt != null && row.complaint.publicLatitude != null && row.complaint.publicLongitude != null,
    area: row.complaint.publicArea, category: row.complaint.category, status: "RESOLVED" as const,
    problemSummary: row.problemSummary, workSummary: row.workSummary, completedAt: row.completedAt,
    submittedAt: row.complaint.createdAt, verifiedAt: row.complaint.events[0]?.createdAt ?? null,
    beforeEvidenceId: row.beforeEvidenceId, afterEvidenceId: row.afterEvidenceId,
    project: project ? { id: project.id, title: project.title, ngoName: project.ngo.name } : null,
    funds: funded ? { campaignTitle: funded.title, verifiedNet: funded.received - funded.refunded, spent: funded.spent } : null,
  };
}
