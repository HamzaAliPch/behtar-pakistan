import { prisma } from "@/lib/prisma";
import { OperationError, type Actor, type Tx } from "./common";

export function requireCaseOperator(actor: Actor) {
  if (actor.role !== "ADMIN" && actor.role !== "CITY_MANAGER") throw new OperationError("forbidden");
}

export async function assertCityAccess(tx: Tx, actor: Actor, cityId: string | null) {
  if (actor.role === "ADMIN") return;
  if (actor.role !== "CITY_MANAGER" || !cityId) throw new OperationError("forbidden");
  const membership = await tx.cityMembership.findUnique({ where: { userId_cityId: { userId: actor.id, cityId } }, select: { city: { select: { status: true } } } });
  if (!membership || membership.city.status !== "ACTIVE") throw new OperationError("forbidden");
}

export async function assertCaseAccess(tx: Tx, actor: Actor, complaintId: string) {
  const complaint = await tx.complaint.findUnique({ where: { id: complaintId }, select: { cityId: true } });
  if (!complaint) throw new OperationError("not_found");
  await assertCityAccess(tx, actor, complaint.cityId);
}

export async function managerCity(actor: Actor, slug: string) {
  requireCaseOperator(actor);
  const city = await prisma.city.findUnique({ where: { slug }, select: { id: true, slug: true, name: true, status: true } });
  if (!city) throw new OperationError("not_found");
  await assertCityAccess(prisma, actor, city.id);
  return city;
}

export async function managerCities(actor: Actor) {
  requireCaseOperator(actor);
  if (actor.role === "ADMIN") return prisma.city.findMany({ where: { status: "ACTIVE" }, select: { id: true, slug: true, name: true } });
  const memberships = await prisma.cityMembership.findMany({ where: { userId: actor.id, city: { status: "ACTIVE" } }, select: { city: { select: { id: true, slug: true, name: true } } } });
  return memberships.map(item => item.city);
}
