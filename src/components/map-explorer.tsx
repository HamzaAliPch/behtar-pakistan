"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { categories } from "@/lib/complaints";
import { DISTRICTS, type Point } from "@/lib/geo-constants";
import { complaintStatuses } from "@/lib/workflow";
import { MapWidget } from "./map-widget";
import type { PublicMarker } from "./karachi-map-canvas";

type Place = { name: string; latitude: number | null; longitude: number | null; district?: string; source: "provider" | "catalog" };

export function MapExplorer({ cities }: { cities: { slug: string; name: string; districts: string[] }[] }) {
  const [city, setCity] = useState(""), [category, setCategory] = useState(""), [status, setStatus] = useState(""), [district, setDistrict] = useState("");
  const [items, setItems] = useState<PublicMarker[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(""), [updatedAt, setUpdatedAt] = useState(""), [truncated, setTruncated] = useState(false);
  const [query, setQuery] = useState(""), [places, setPlaces] = useState<Place[]>([]), [focus, setFocus] = useState<Point | null>(null);
  const [searchError, setSearchError] = useState(""), [searching, setSearching] = useState(false);
  const searchTimer = useRef<number | null>(null), searchAbort = useRef<AbortController | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const params = new URLSearchParams({ city, category, status, district });
      const response = await fetch(`/api/map?${params}`, { signal, cache: "no-store" });
      if (!response.ok) throw new Error("Map updates are temporarily unavailable.");
      const data = await response.json() as { items: PublicMarker[]; updatedAt: string; truncated: boolean };
      setItems(data.items); setUpdatedAt(data.updatedAt); setTruncated(data.truncated); setError("");
    } catch (caught) { if (!signal?.aborted) setError(caught instanceof Error ? caught.message : "Map updates are unavailable."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [city, category, status, district]);
  useEffect(() => { const controller = new AbortController(); const initial = window.setTimeout(() => void load(controller.signal), 0); const interval = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 45_000); return () => { controller.abort(); window.clearTimeout(initial); window.clearInterval(interval); }; }, [load]);
  useEffect(() => () => { if (searchTimer.current !== null) window.clearTimeout(searchTimer.current); searchAbort.current?.abort(); }, []);
  function searchLocation(event: React.FormEvent) {
    event.preventDefault(); setSearchError(""); setPlaces([]); const term = query.trim(); if (term.length < 3) { setSearchError("Enter at least three characters to search."); return; }
    if (searchTimer.current !== null) window.clearTimeout(searchTimer.current);
    searchAbort.current?.abort();
    const controller = new AbortController(); searchAbort.current = controller; setSearching(true);
    searchTimer.current = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        const data = await response.json() as { items?: Place[]; status?: string; message?: string; error?: string };
        if (!response.ok) throw new Error(data.error || "Search unavailable");
        setPlaces(data.items ?? []);
        if (data.status === "catalog_only") setSearchError(data.message ?? "Listed areas found; choose one below. No map coordinates were supplied.");
        else if (!data.items?.length) setSearchError("No Karachi location found. Try a nearby area.");
      } catch (caught) { if (!controller.signal.aborted) setSearchError(caught instanceof Error ? caught.message : "Search unavailable"); }
      finally { if (!controller.signal.aborted) setSearching(false); }
    }, 300);
  }
  return <div className="mt-8 grid gap-6 lg:grid-cols-[310px_minmax(0,1fr)]"><aside className="surface-card h-fit space-y-5"><h2 className="text-lg font-bold">Explore reports</h2><div><label className="field-label" htmlFor="map-city">City</label><select id="map-city" className="field-input" value={city} onChange={event => { setCity(event.target.value); setDistrict(""); setFocus(null); }}><option value="">All active cities</option>{cities.map(item => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></div><div><label className="field-label" htmlFor="map-category">Category</label><select id="map-category" className="field-input" value={category} onChange={event => setCategory(event.target.value)}><option value="">All categories</option>{categories.map(value => <option key={value}>{value}</option>)}</select></div><div><label className="field-label" htmlFor="map-status">Status</label><select id="map-status" className="field-input" value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option>{complaintStatuses.map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></div><div><label className="field-label" htmlFor="map-district">District</label><select id="map-district" className="field-input" value={district} onChange={event => setDistrict(event.target.value)}><option value="">All districts</option>{(cities.find(item => item.slug === city)?.districts ?? [...new Set([...DISTRICTS, ...cities.flatMap(item => item.districts)])]).map(value => <option key={value}>{value}</option>)}</select></div><form onSubmit={searchLocation}><label className="field-label" htmlFor="map-search">Find a Karachi area or address</label><div className="flex gap-2"><input id="map-search" className="field-input min-w-0" value={query} onChange={event => setQuery(event.target.value)} minLength={3} maxLength={100} required /><button className="btn-dark cursor-pointer" type="submit" disabled={searching}>{searching ? "Searching…" : "Find"}</button></div></form>{searchError && <p className="text-sm text-amber-800" role="alert">{searchError}</p>}{places.length > 0 && <ul className="space-y-2 text-sm">{places.map((place, index) => <li key={index}><button className="text-left text-emerald-700 underline" type="button" onClick={() => { if (place.latitude !== null && place.longitude !== null) setFocus({ latitude: place.latitude, longitude: place.longitude }); else { setCity("karachi"); setDistrict(place.district ?? ""); setSearchError("Listed area selected. Map coordinates are unavailable; use the district filter or place a pin when reporting."); } setPlaces([]); }}>{place.name}</button></li>)}</ul>}<p className="text-xs leading-5 text-slate-500">Markers show approximate locations. Map tiles and address search use OpenStreetMap services. Search only when needed.</p></aside><div className="space-y-5"><div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><MapWidget markers={items} focus={focus} /></div><div className="surface-card" aria-live="polite"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">Public reports ({items.length})</h2><span className="text-xs text-slate-500">{updatedAt ? `Last updated ${new Date(updatedAt).toLocaleTimeString()}` : "Waiting for first update"}</span></div>{truncated && <p className="mt-3 text-xs text-amber-800">Showing the 500 most recently updated reports. Apply filters to narrow the map.</p>}{loading && <p className="mt-4 text-sm" role="status">Loading approved reports…</p>}{error && <p className="form-error mt-4" role="alert">{error} <button type="button" className="underline" onClick={() => void load()}>Retry</button></p>}{!loading && !error && items.length === 0 && <p className="mt-4 text-sm text-slate-600">No approved public reports match these filters. Private and unverified reports do not appear here.</p>}{items.length > 0 && <ul className="mt-4 divide-y divide-slate-100">{items.map(item => <li key={item.id} className="py-3"><Link href={`/map/case/${encodeURIComponent(item.id)}`} className="font-semibold text-emerald-800 underline">{item.title}</Link><p className="mt-1 text-xs text-slate-500">{item.area} · {item.category} · {item.status.replaceAll("_", " ")}</p></li>)}</ul>}</div></div></div>;
}
