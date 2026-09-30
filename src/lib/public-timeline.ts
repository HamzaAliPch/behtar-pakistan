type PublicEvent = { visibility: string; actor?: { name: string } | null };

export function visibleTrackingEvents<T extends PublicEvent>(events: T[], viewer: { role: string } | null, owner: boolean): T[] {
  return events
    .filter(item => viewer?.role === "ADMIN" || item.visibility === "PUBLIC" || (owner && item.visibility === "OWNER"))
    .map(item => viewer?.role === "ADMIN" || owner ? item : { ...item, actor: null });
}
