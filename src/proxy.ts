import { NextResponse, type NextRequest } from "next/server";

const publicHost = "test.socialautomation.my.id";
const localHosts = new Set(["127.0.0.1:3101", "localhost:3101"]);

export function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase() ?? "";
  // A tunnel aimed at the main development server must never expose live local data.
  if (process.env.FRIEND_TEST_MODE !== "1") {
    if (host === publicHost) return new NextResponse("Test hostname is not connected to the isolated server", { status: 421 });
    return NextResponse.next();
  }
  if (host !== publicHost && !localHosts.has(host)) return new NextResponse("Unknown host", { status: 421 });
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    const allowed = host === publicHost ? `https://${publicHost}` : `http://${host}`;
    if ((host === publicHost || origin) && origin !== allowed) return new NextResponse("Invalid request origin", { status: 403 });
  }
  const response = NextResponse.next();
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}
