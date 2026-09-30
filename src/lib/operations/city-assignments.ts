import { prisma } from "@/lib/prisma";
import { OperationError, requireAdmin, type Actor } from "./common";

export type CityResource = "VOLUNTEER" | "NGO" | "DEPARTMENT" | "CONTACT";

export async function assignManagerCity(actor: Actor, userId: string, cityId: string) {
  requireAdmin(actor);
  return prisma.$transaction(async tx => {
    const [user, city] = await Promise.all([tx.user.findUnique({ where: { id: userId }, select: { role: true } }), tx.city.findUnique({ where: { id: cityId }, select: { status: true } })]);
    if (user?.role !== "CITY_MANAGER" || !city) throw new OperationError("invalid");
    const row = await tx.cityMembership.upsert({ where: { userId_cityId: { userId, cityId } }, create: { userId, cityId }, update: {} });
    await tx.auditLog.create({ data: { actorId: actor.id, action: "CITY_MANAGER_ASSIGNED", targetType: "User", targetId: userId, details: cityId } });
    return row;
  });
}

export async function assignCityResource(actor: Actor, type: CityResource, id: string, cityId: string) {
  requireAdmin(actor);
  if (!["VOLUNTEER", "NGO", "DEPARTMENT", "CONTACT"].includes(type)) throw new OperationError("invalid");
  return prisma.$transaction(async tx => {
    const city = await tx.city.findUnique({ where: { id: cityId }, select: { id: true } });
    if (!city) throw new OperationError("not_found");
    let oldCity: string | null | undefined;
    if (type === "VOLUNTEER") {
      const row = await tx.volunteerApplication.findUnique({ where: { id }, select: { cityId: true } });
      if (!row) throw new OperationError("not_found"); oldCity = row.cityId;
      await tx.volunteerApplication.update({ where: { id }, data: { cityId } });
    } else if (type === "NGO") {
      const row = await tx.partnerNgo.findUnique({ where: { id }, select: { cityId: true } });
      if (!row) throw new OperationError("not_found"); oldCity = row.cityId;
      await tx.partnerNgo.update({ where: { id }, data: { cityId } });
    } else if (type === "DEPARTMENT") {
      const row = await tx.department.findUnique({ where: { id }, select: { cityId: true } });
      if (!row) throw new OperationError("not_found"); oldCity = row.cityId;
      await tx.department.update({ where: { id }, data: { cityId } });
    } else {
      const row = await tx.crmContact.findUnique({ where: { id }, select: { cityId: true } });
      if (!row) throw new OperationError("not_found"); oldCity = row.cityId;
      await tx.crmContact.update({ where: { id }, data: { cityId } });
    }
    await tx.auditLog.create({ data: { actorId: actor.id, action: "CITY_RESOURCE_ASSIGNED", targetType: type, targetId: id, details: JSON.stringify({ from: oldCity, to: cityId }) } });
  });
}
