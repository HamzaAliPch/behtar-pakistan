import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/session";
import { assignCityResource, assignManagerCity, type CityResource } from "@/lib/operations/city-assignments";
import { AdminNav } from "@/components/operations";

async function save(form: FormData) {
  "use server";
  const actor = await requireRole(["ADMIN"]);
  const cityId = String(form.get("cityId") ?? ""), type = String(form.get("type") ?? ""), id = String(form.get("id") ?? "");
  try {
    if (type === "MANAGER") await assignManagerCity(actor, id, cityId);
    else await assignCityResource(actor, type as CityResource, id, cityId);
  } catch { redirect("/admin/city-scopes?error=1"); }
  revalidatePath("/admin/city-scopes"); redirect("/admin/city-scopes?saved=1");
}

export default async function CityScopesPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  await requireRole(["ADMIN"], "/admin/city-scopes");
  const [cities, managers, volunteers, ngos, departments, contacts, query] = await Promise.all([
    prisma.city.findMany({ select: { id: true, name: true, status: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { role: "CITY_MANAGER" }, select: { id: true, name: true, email: true, cityMemberships: { select: { city: { select: { name: true } } } } }, take: 100 }),
    prisma.volunteerApplication.findMany({ select: { id: true, fullName: true, city: { select: { name: true } } }, take: 200 }),
    prisma.partnerNgo.findMany({ select: { id: true, name: true, city: { select: { name: true } } }, take: 200 }),
    prisma.department.findMany({ select: { id: true, name: true, city: { select: { name: true } } }, take: 200 }),
    prisma.crmContact.findMany({ select: { id: true, name: true, city: { select: { name: true } } }, take: 200 }),
    searchParams,
  ]);
  const sets = [{ type: "MANAGER", title: "City managers", rows: managers.map(item => ({ id: item.id, name: `${item.name} (${item.email})`, city: item.cityMemberships.map(link => link.city.name).join(", ") })) }, { type: "VOLUNTEER", title: "Volunteers", rows: volunteers.map(item => ({ id: item.id, name: item.fullName, city: item.city?.name })) }, { type: "NGO", title: "NGO partners", rows: ngos.map(item => ({ id: item.id, name: item.name, city: item.city?.name })) }, { type: "DEPARTMENT", title: "Departments", rows: departments.map(item => ({ id: item.id, name: item.name, city: item.city?.name })) }, { type: "CONTACT", title: "Private contacts", rows: contacts.map(item => ({ id: item.id, name: item.name, city: item.city?.name })) }];
  return <section className="inner-page"><div className="page-shell"><p className="section-kicker">Platform owner · City access</p><h1 className="page-heading">City assignments</h1><p className="page-subtitle">Assign a city only after checking the team member or record. Historical records without a city stay with platform admins. New manager accounts use the secure local script.</p><AdminNav />{query.error && <p role="alert" className="form-error mt-5">Could not save the assignment. Check the account and city.</p>}{query.saved && <p role="status" className="mt-5 text-emerald-800">Assignment saved and audited.</p>}<div className="mt-8 space-y-6">{sets.map(group => <section className="surface-card" key={group.type}><h2 className="text-xl font-bold">{group.title}</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{group.rows.map(row => <form action={save} key={row.id} className="rounded-xl border p-3"><p className="text-sm font-semibold">{row.name}</p><p className="mt-1 text-xs text-slate-600">Current: {row.city || "Unallocated"}</p><input type="hidden" name="type" value={group.type} /><input type="hidden" name="id" value={row.id} /><div className="mt-3 flex gap-2"><select name="cityId" className="field-input" aria-label={`City for ${row.name}`}>{cities.map(city => <option key={city.id} value={city.id}>{city.name} · {city.status}</option>)}</select><button className="btn-outline">Assign</button></div></form>)}{!group.rows.length && <p className="text-sm text-slate-600">No records in this category.</p>}</div></section>)}</div></div></section>;
}
