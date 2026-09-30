import type { Role } from "@prisma/client";

export type Viewer = { id: string; role: Role } | null;

export function isComplaintOwner(viewer: Viewer, ownerId: string | null): boolean {
  return Boolean(viewer && ownerId && viewer.id === ownerId);
}

export function canViewComplaint(viewer: Viewer, ownerId: string | null): boolean {
  return viewer?.role === "ADMIN" || isComplaintOwner(viewer, ownerId);
}

export function roleHome(role: Role): string {
  if (role === "ADMIN") return "/admin";
  if (role === "CITY_MANAGER") return "/city";
  if (role === "VOLUNTEER") return "/volunteer";
  return "/dashboard";
}
