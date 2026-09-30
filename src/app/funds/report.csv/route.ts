import { getFinanceSnapshot } from "@/lib/finance";
import { activePublicCities, selectedPublicCity } from "@/lib/public-cities";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const cities = await activePublicCities();
  const city = selectedPublicCity(new URL(request.url).searchParams.get("city") || undefined, cities);
  if (city === undefined) return new Response("Invalid city", { status: 400 });
  const funds = await getFinanceSnapshot(city?.id ?? undefined);
  const lines = ["month,verified_receipts_pkr,verified_refunds_pkr,paid_expenses_pkr,net_change_pkr", ...funds.monthly.map(item => `${item.month},${item.received},${item.refunded},${item.spent},${item.net}`)];
  return new Response(lines.join("\r\n") + "\r\n", { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename=behtar-pakistan-funds-${city?.slug ?? "nationwide"}.csv`, "Cache-Control": "no-store" } });
}
