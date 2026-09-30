import { prisma } from "@/lib/prisma";
import { pakistanMobile } from "@/lib/notifications";

export class CitizenProfileError extends Error {}

export function cleanCitizenPhone(value: string): string | null {
  const phone = value.trim();
  if (!phone) return null;
  if (phone.length > 25 || !/^\+?[0-9][0-9 ()-]{5,23}[0-9]$/.test(phone) || phone.replace(/\D/g, "").length < 7) throw new CitizenProfileError("Enter a valid phone number or leave it blank.");
  return phone;
}

export async function profileCityId(slug: string): Promise<string | null> {
  if (!slug) return null;
  if (!/^[a-z0-9-]{2,50}$/.test(slug)) throw new CitizenProfileError("Choose a city from the list.");
  const city = await prisma.city.findUnique({ where: { slug }, select: { id: true } });
  if (!city) throw new CitizenProfileError("Choose a city from the list.");
  return city.id;
}

export async function saveCitizenProfile(actor: { id: string; role: string }, input: { name: string; phone: string; citySlug: string; smsOptIn?: boolean; whatsappOptIn?: boolean }) {
  if (actor.role !== "CITIZEN" && actor.role !== "VOLUNTEER") throw new CitizenProfileError("Only citizens and volunteers can edit a citizen profile.");
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) throw new CitizenProfileError("Enter a name of 2–80 characters.");
  const phone = cleanCitizenPhone(input.phone);
  if ((input.smsOptIn || input.whatsappOptIn) && !pakistanMobile(phone)) throw new CitizenProfileError("Use a valid Pakistan mobile number to enable messaging.");
  const cityId = await profileCityId(input.citySlug);
  return prisma.$transaction(async tx => {
    const user = await tx.user.update({ where: { id: actor.id }, data: { name }, select: { id: true, name: true } });
    await tx.citizenProfile.upsert({ where: { userId: actor.id }, create: { userId: actor.id, phone, cityId, smsOptIn: input.smsOptIn ?? false, whatsappOptIn: input.whatsappOptIn ?? false }, update: { phone, cityId, ...(input.smsOptIn === undefined ? {} : { smsOptIn: input.smsOptIn }), ...(input.whatsappOptIn === undefined ? {} : { whatsappOptIn: input.whatsappOptIn }) } });
    for (const [channel, enabled] of [["SMS", input.smsOptIn], ["WHATSAPP", input.whatsappOptIn]] as const) if (enabled === false) await tx.notificationOutbox.updateMany({ where: { userId: actor.id, channel, status: { in: ["PENDING", "RETRY", "PROCESSING"] } }, data: { status: "CANCELLED", lastErrorCode: "opted_out" } });
    return user;
  });
}
