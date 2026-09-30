import { getCurrentUser } from "@/lib/auth/session";
import { allowRequest } from "@/lib/rate-limit";
import { ReportInputError, submitCitizenReport } from "@/lib/operations/report";

const MAX_REQUEST_BYTES = 27 * 1024 * 1024;
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "CITIZEN" && user.role !== "VOLUNTEER")) return Response.json({ error: "Sign in to submit a report." }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin) {
    const requestHost = request.headers.get("host") ?? new URL(request.url).host;
    let submittedOrigin: URL;
    try { submittedOrigin = new URL(origin); } catch { return Response.json({ error: "Invalid request origin." }, { status: 403 }); }
    if (submittedOrigin.host !== requestHost || !["http:", "https:"].includes(submittedOrigin.protocol)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) return Response.json({ error: "Send the report form with photos." }, { status: 415 });
  const declaredSize = Number(request.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_REQUEST_BYTES) return Response.json({ error: "The report upload is too large. Use up to five photos of 5 MB each." }, { status: 413 });
  if (!allowRequest(`report:${user.id}`, 10, 10 * 60_000)) return Response.json({ error: "Please wait before trying another submission." }, { status: 429 });
  try {
    const form = await request.formData();
    const files = form.getAll("photos");
    if (files.some(file => !(file instanceof File))) throw new ReportInputError("Choose valid image files.");
    const value = (key: string) => String(form.get(key) ?? "");
    const result = await submitCitizenReport(user, { citySlug: value("citySlug"), submissionKey: value("submissionKey"), title: value("title"), category: value("category"), description: value("description"), district: value("district"), area: value("area"), manualArea: value("manualArea") === "1", streetOrBlock: value("streetOrBlock"), landmark: value("landmark"), privateDirections: value("privateDirections"), latitude: value("latitude"), longitude: value("longitude"), photos: files as File[] });
    return Response.json(result, { status: result.duplicate ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ReportInputError) return Response.json({ error: error.message }, { status: 400 });
    console.error("Report submission failed", error);
    return Response.json({ error: "We could not save the report. Your form is still here; please try again." }, { status: 500 });
  }
}
