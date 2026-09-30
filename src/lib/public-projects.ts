import { prisma } from "@/lib/prisma";
import { getFinanceSnapshot } from "@/lib/finance";
import type { Prisma } from "@prisma/client";
import { getPublishedStory } from "@/lib/completed-work-public";
import { activePublicCities, publicProjectCityFilter } from "@/lib/public-cities";

const publicWhere: Prisma.NgoProjectWhereInput = { publicApproved: true, status: { in: ["ACTIVE", "COMPLETED"] }, ngo: { status: "ACTIVE", verifiedAt: { not: null } } };

export async function listPublicProjects(cityId: string | null = null) {
  const cities = await activePublicCities();
  if (cityId && !cities.some(city => city.id === cityId)) return [];
  return prisma.ngoProject.findMany({ where: { ...publicWhere, ...publicProjectCityFilter(cityId, cities.map(item => item.id)) }, select: { id: true, complaintId: true, title: true, status: true, publicSummary: true, updatedAt: true, ngo: { select: { name: true, serviceAreas: true } }, milestones: { where: { completedAt: { not: null }, publicApproved: true }, select: { id: true } } }, orderBy: { updatedAt: "desc" } });
}

export async function getPublicProject(id: string) {
  const cities = await activePublicCities();
  const project = await prisma.ngoProject.findFirst({ where: { ...publicWhere, ...publicProjectCityFilter(null, cities.map(item => item.id)), id }, select: {
    id: true, title: true, status: true, publicSummary: true, updatedAt: true, campaignId: true,
    ngo: { select: { name: true, serviceAreas: true } },
    campaign: { select: { id: true, title: true, status: true, approvedAt: true } },
    complaint: { select: { id: true, publicVisible: true, publicTitle: true, publicArea: true, category: true, status: true } },
    milestones: { where: { completedAt: { not: null }, publicApproved: true }, select: { id: true, title: true, outcome: true, completedAt: true }, orderBy: { completedAt: "desc" } },
    evidence: { where: { publicApprovedAt: { not: null }, mimeType: { startsWith: "image/" } }, select: { id: true, stage: true, createdAt: true }, orderBy: { createdAt: "desc" } },
  } });
  if (!project) return null;
  const funds = project.campaign?.approvedAt && ["PUBLISHED", "CLOSED"].includes(project.campaign.status)
    ? (await getFinanceSnapshot()).campaigns.find(item => item.id === project.campaignId) ?? null : null;
  const linked = project.complaint ? await prisma.completedWorkStory.findUnique({ where: { complaintId: project.complaint.id }, select: { id: true } }) : null;
  const linkedStory = linked ? await getPublishedStory(linked.id, false) : null;
  return { ...project, complaint: project.complaint?.publicVisible || linkedStory ? project.complaint : null, campaign: funds ? project.campaign : null, funds, linkedStoryId: linkedStory?.id ?? null };
}
