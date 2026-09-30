"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { PublicMarker } from "./karachi-map-canvas";
import type { Point } from "@/lib/geo-constants";

function MapUnavailable() { return <div className="karachi-map grid place-items-center bg-emerald-50 p-5 text-center text-sm text-slate-700" role="alert"><div><p>The map could not load. The area and report list remain available.</p><button type="button" className="mt-3 font-bold text-emerald-800 underline" onClick={() => window.location.reload()}>Retry map</button></div></div>; }
function MapLoading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const timer = window.setTimeout(() => setSlow(true), 12_000); return () => window.clearTimeout(timer); }, []);
  return slow ? <MapUnavailable /> : <div className="karachi-map grid place-items-center bg-emerald-50 text-sm text-slate-600" role="status">Loading Karachi map…</div>;
}
const Canvas = dynamic(() => import("./karachi-map-canvas").catch(() => ({ default: MapUnavailable })), { ssr: false, loading: () => <MapLoading /> });
export function MapWidget(props: { markers?: PublicMarker[]; point?: Point | null; onPick?: (point: Point) => void; focus?: Point | null }) { return <Canvas {...props} />; }
