import { getCurrentUser } from "@/lib/auth/session";
import { answerAssistant, LANGUAGES, suggestCategory, type AssistantLanguage } from "@/lib/assistant";
import { allowRequest, requestIdentity } from "@/lib/rate-limit";
import { requestHumanSupport } from "@/lib/support";

export async function POST(request: Request) {
  const size = Number(request.headers.get("content-length") || 0);
  if (size > 4096) return Response.json({ error: "Request too large" }, { status: 413 });
  const user = await getCurrentUser();
  if (!allowRequest(`assistant:${user?.id ?? requestIdentity(request)}`, 20, 60_000)) return Response.json({ error: "Please wait before asking again" }, { status: 429 });
  try {
    const raw = await request.text();
    if (raw.length > 4096) return Response.json({ error: "Request too large" }, { status: 413 });
    const body = JSON.parse(raw) as { message?: unknown; language?: unknown; action?: unknown; city?: unknown };
    const language = String(body.language ?? "en");
    if (!LANGUAGES.includes(language as AssistantLanguage) || typeof body.message !== "string" || body.message.trim().length < 2 || body.message.length > 800 || (body.city !== undefined && (typeof body.city !== "string" || !/^[a-z0-9-]{2,50}$/.test(body.city)))) return Response.json({ error: "Invalid question" }, { status: 400 });
    if (body.action === "escalate") {
      if (!user || (user.role !== "CITIZEN" && user.role !== "VOLUNTEER")) return Response.json({ error: "Sign in to request human support" }, { status: 401 });
      try { await requestHumanSupport(user, body.message, language); return Response.json({ submitted: true }); }
      catch { return Response.json({ error: "Could not send support request. Check the question or your open requests." }, { status: 400 }); }
    }
    if (body.action === "category") return Response.json({ category: await suggestCategory(body.message) });
    const reply = await answerAssistant(user, body.message, language as AssistantLanguage, body.city as string | undefined);
    return Response.json(reply, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Unable to answer right now" }, { status: 400 }); }
}
