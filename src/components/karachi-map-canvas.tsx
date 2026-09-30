"use client";

import { useEffect, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import Link from "next/link";
import { KARACHI_CENTER, type Point } from "@/lib/geo-constants";

export type PublicMarker = { id: string; title: string; category: string; area: string; district: string | null; status: string; latitude: number; longitude: number };
const icon = L.divIcon({ className: "kfx-marker-wrap", html: '<span class="kfx-marker" aria-hidden="true"></span>', iconSize: [30, 38], iconAnchor: [15, 36] });
const tileUrl = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const attribution = process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';

function FlyTo({ point }: { point?: Point | null }) {
  const map = useMap();
  useEffect(() => { if (point) map.flyTo([point.latitude, point.longitude], Math.max(map.getZoom(), 14)); }, [map, point]);
  return null;
}

function Picker({ point, onPick }: { point: Point | null; onPick: (point: Point) => void }) {
  useMapEvents({ click(event) { onPick({ latitude: event.latlng.lat, longitude: event.latlng.lng }); } });
  return point ? <Marker position={[point.latitude, point.longitude]} icon={icon} draggable eventHandlers={{ dragend(event) { const position = event.target.getLatLng(); onPick({ latitude: position.lat, longitude: position.lng }); } }}><Popup>Drag this pin to place the issue location.</Popup></Marker> : null;
}

export default function KarachiMapCanvas({ markers = [], point, onPick, focus }: { markers?: PublicMarker[]; point?: Point | null; onPick?: (point: Point) => void; focus?: Point | null }) {
  const [tileAttempt, setTileAttempt] = useState(0);
  const [tileErrors, setTileErrors] = useState(0);
  const [tileLoaded, setTileLoaded] = useState(false);
  const pins = markers.map(item => <Marker key={item.id} position={[item.latitude, item.longitude]} icon={icon} title={item.title} keyboard><Popup><div className="space-y-1"><strong>{item.title}</strong><div>{item.category} · {item.area}</div><div>Status: {item.status.replaceAll("_", " ")}</div><Link href={`/map/case/${encodeURIComponent(item.id)}`} className="font-semibold text-emerald-700 underline">View public case</Link></div></Popup></Marker>);
  return <div className="relative"><MapContainer center={KARACHI_CENTER} zoom={11} scrollWheelZoom={false} className="karachi-map" aria-label={onPick ? "Select an issue location on the Karachi map" : "Public Karachi complaints map"}>
    <TileLayer key={tileAttempt} url={tileUrl} attribution={attribution} eventHandlers={{ tileerror: () => setTileErrors(current => current + 1), tileload: () => setTileLoaded(true) }} />
    <FlyTo point={focus ?? point} />
    {onPick && <Picker point={point ?? null} onPick={onPick} />}
    {pins.length > 25 ? <MarkerClusterGroup chunkedLoading>{pins}</MarkerClusterGroup> : pins}
  </MapContainer>{!tileLoaded && tileErrors >= 3 && <div className="absolute inset-x-3 bottom-8 z-[1000] rounded-xl border border-amber-300 bg-white p-3 text-sm shadow-lg" role="alert"><p>Map background is unavailable. You can still use the area selector and report list.</p><button type="button" className="mt-2 font-bold text-emerald-800 underline" onClick={() => { setTileErrors(0); setTileLoaded(false); setTileAttempt(current => current + 1); }}>Retry map tiles</button></div>}</div>;
}
