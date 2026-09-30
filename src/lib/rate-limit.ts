const buckets = new Map<string, { count: number; reset: number }>();

export function allowRequest(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (buckets.size > 10000) for (const [id, value] of buckets) if (value.reset < now) buckets.delete(id);
  const current = buckets.get(key);
  if (!current || current.reset <= now) { buckets.set(key, { count: 1, reset: now + windowMs }); return true; }
  if (current.count >= limit) return false;
  current.count++;
  return true;
}

export function requestIdentity(request: Request): string {
  // A trusted reverse proxy should replace this with its verified client IP in deployment.
  return (request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local").slice(0, 80);
}
