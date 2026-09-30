"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MapWidget } from "./map-widget";
import { KARACHI_BOUNDS, type Point } from "@/lib/geo-constants";

type Nearby = { id: string; title: string; area: string; category: string; status: string; distanceKm: number | null; likelySameIssue?: boolean };
type Place = { name: string; latitude: number | null; longitude: number | null; district?: string; source: "provider" | "catalog" };

export function ReportLocation({ point, onPointChange, district, area, category, title, description, citySlug = "karachi", manualArea = false }: { point: Point | null; onPointChange: (point: Point | null) => void; district: string; area: string; category: string; title: string; description: string; citySlug?: string; manualArea?: boolean }) {
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [focus, setFocus] = useState<Point | null>(null);
  const [message, setMessage] = useState("");
  const [nearby, setNearby] = useState<Nearby[]>([]);
  const [busy, setBusy] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const searchTimer = useRef<number | null>(null), searchAbort = useRef<AbortController | null>(null);
  useEffect(() => () => { if (searchTimer.current !== null) window.clearTimeout(searchTimer.current); searchAbort.current?.abort(); }, []);

  function pickPoint(value: Point) {
    if (value.latitude < KARACHI_BOUNDS.minLat || value.latitude > KARACHI_BOUNDS.maxLat || value.longitude < KARACHI_BOUNDS.minLon || value.longitude > KARACHI_BOUNDS.maxLon) { setMessage("Choose a location within Karachi."); return; }
    onPointChange(value);
    setFocus(value);
    setMessage("Issue pin selected. Drag it to adjust the location.");
  }

  function search(term = query) {
    setMessage(""); setPlaces([]);
    if (term.trim().length < 3) { setMessage("Enter at least three characters to search."); return; }
    if (searchTimer.current !== null) window.clearTimeout(searchTimer.current);
    searchAbort.current?.abort();
    const controller = new AbortController(); searchAbort.current = controller; setBusy(true);
    searchTimer.current = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(term.trim())}`, { signal: controller.signal });
        const data = await response.json() as { items?: Place[]; status?: string; message?: string; error?: string };
        if (!response.ok) throw new Error(data.error || "Search unavailable");
        setPlaces(data.items ?? []);
        if (data.status === "catalog_only") setMessage(data.message ?? "Listed areas found without map coordinates. You can still place a pin manually.");
        else if (data.items?.length === 1 && data.items[0].latitude !== null && data.items[0].longitude !== null) setFocus({ latitude: data.items[0].latitude, longitude: data.items[0].longitude });
        else if (!data.items?.length) setMessage("No Karachi result found. Use the manual area or place a pin on the map.");
      } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Search is unavailable; manual area selection still works."); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    }, 300);
  }

  function locate() {
    if (!navigator.geolocation) { setMessage("Device location is unavailable. Use the map or manual area selection."); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(position => { setBusy(false); pickPoint({ latitude: position.coords.latitude, longitude: position.coords.longitude }); }, () => { setBusy(false); setMessage("Location permission was unavailable or declined. Manual area selection still works."); }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 });
  }

  async function checkNearby() {
    if (!category) { setMessage("Choose a category first."); return; }
    if (!point && (!district || !area)) { setMessage("Choose a district and area, or place a pin, to check nearby issues."); return; }
    setBusy(true); setMessage(""); setNearby([]);
    try {
      const params = new URLSearchParams({ category, title, description, district, area, citySlug, manualArea: manualArea ? "1" : "0", ...(point ? { latitude: String(point.latitude), longitude: String(point.longitude) } : {}) });
      const response = await fetch(`/api/nearby?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setNearby(data.items);
      if (!data.items.length) setMessage("No similar approved public reports were found. You can continue your report.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Nearby search is unavailable. You can still submit your report."); }
    finally { setBusy(false); }
  }

  return <div className="space-y-4"><div><h3 className="text-lg font-bold">Optional issue pin</h3><p className="mt-1 text-sm leading-6 text-slate-600">Preview an area, search an address, click the map, drag the pin, or use device location with permission. A district and area are enough to submit your report if you cannot add a pin. A public map marker requires a recorded location that our team verifies and approves.</p><p className="mt-1 text-xs text-slate-500">Address searches use OpenStreetMap. Avoid searching for a private home address.</p></div>
    <div className="flex flex-wrap gap-2"><input aria-label="Search Karachi area or address" className="field-input min-w-44 flex-1" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search area or address" maxLength={100} /><button type="button" onClick={() => void search()} disabled={busy} className="btn-dark cursor-pointer disabled:opacity-60">Search</button><button type="button" onClick={locate} disabled={busy} className="min-h-12 rounded-xl border border-emerald-700 px-4 text-sm font-semibold text-emerald-800 disabled:opacity-60">Use my location</button></div>
    {area && <button type="button" onClick={() => void search(`${area}, ${district}`)} disabled={busy} className="text-sm font-bold text-emerald-700 underline disabled:opacity-60">Preview {area} on map</button>}
    {places.length > 0 && <ul aria-label="Karachi search results" className="space-y-2 rounded-xl border border-slate-200 p-3 text-sm">{places.map((place, index) => <li key={`${place.name}-${index}`}><button type="button" className="text-left text-emerald-700 underline" onClick={() => { if (place.latitude !== null && place.longitude !== null) { setFocus({ latitude: place.latitude, longitude: place.longitude }); setMessage("Area preview shown. Click the map to set the issue pin, or continue without a pin."); } else { setMessage(`Listed in District ${place.district ?? "Karachi"}. Select that district and area above, or place a pin manually; no coordinates were invented.`); } setPlaces([]); }}>{place.name}</button></li>)}</ul>}
    <MapWidget key={resetKey} point={point} onPick={pickPoint} focus={focus} />
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-600">{point ? `Issue pin: ${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}. Precise coordinates stay private.` : "No issue pin selected. Manual area is enough."}</p><button type="button" onClick={() => { onPointChange(null); setFocus(null); setPlaces([]); setResetKey(value => value + 1); setMessage("Pin cleared; Karachi map reset."); }} className="text-sm font-semibold text-emerald-700 underline">Clear pin and reset map</button></div>
    <button type="button" onClick={() => void checkNearby()} disabled={busy} className="min-h-12 rounded-xl border border-emerald-700 px-4 py-3 text-sm font-bold text-emerald-800 disabled:opacity-60">{busy ? "Checking…" : "Check Nearby Issues"}</button>
    {message && <p className="text-sm text-slate-600" role="status">{message}</p>}
    {nearby.length > 0 && <div className="rounded-xl bg-emerald-50 p-4"><h3 className="font-bold">Related approved public reports</h3><p className="mt-1 text-xs text-slate-600">You can follow an existing case instead of submitting a duplicate. No cases are merged automatically. If this is a different issue, continue filing your own report.</p><ul className="mt-3 space-y-3">{nearby.map(item => <li key={item.id} className="text-sm"><Link href={`/map/case/${encodeURIComponent(item.id)}`} target="_blank" className="font-semibold text-emerald-800 underline">{item.title} · view or support this report</Link><span className="block text-xs text-slate-600">{item.likelySameIssue ? "Possible same issue · " : "Related nearby issue · "}{item.area} · {item.distanceKm == null ? "same selected area" : `about ${item.distanceKm} km away`} · {item.status.replaceAll("_", " ")}</span></li>)}</ul><button type="button" onClick={() => { setNearby([]); setMessage("This is a different issue. Continue your own report with the details you entered."); }} className="mt-4 text-sm font-bold text-emerald-800 underline">This is a different issue — continue my report</button></div>}
  </div>;
}
