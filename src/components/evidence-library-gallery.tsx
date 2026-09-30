"use client";
import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";

export type LibraryMedia = { id: string; stage: string; mimeType: string; createdAt: string; note: string | null; uploader: string; reference: string; complaintId: string; category: string; district: string | null; area: string; taskCode: string | null; ngoProject: string | null };

function Media({ item, large = false }: { item: LibraryMedia; large?: boolean }) {
  const src = `/api/evidence/${encodeURIComponent(item.id)}`;
  return item.mimeType.startsWith("video/") ? <video src={src} controls preload="metadata" className={`${large ? "max-h-[75vh]" : "h-44"} w-full bg-black object-contain`} aria-label={`${item.stage} field video for ${item.reference}`} /> : <Image unoptimized src={src} alt={`${item.stage} evidence for ${item.reference}`} width={large ? 1200 : 400} height={large ? 800 : 260} className={`${large ? "max-h-[75vh]" : "h-44"} w-full object-contain`} />;
}

export function EvidenceLibraryGallery({ items }: { items: LibraryMedia[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<LibraryMedia | null>(null);
  function open(item: LibraryMedia) { setSelected(item); dialog.current?.showModal(); }
  return <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.map(item => <article key={item.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white"><button type="button" className="w-full cursor-zoom-in bg-slate-100" onClick={() => open(item)} aria-label={`Open ${item.stage.toLowerCase()} media for ${item.reference}`}><Media item={item} /></button><div className="p-4"><div className="flex flex-wrap justify-between gap-2"><strong className="text-sm">{item.stage} · {item.mimeType.startsWith("video/") ? "Video" : "Photo"}</strong><span className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleDateString("en-PK")}</span></div><p className="mt-2 text-xs text-slate-600">{item.reference} · {item.category} · {item.district ?? "District unknown"} / {item.area}</p><p className="mt-1 text-xs text-slate-600">Uploader: {item.uploader}{item.taskCode ? ` · Task ${item.taskCode}` : ""}{item.ngoProject ? ` · ${item.ngoProject}` : ""}</p>{item.note && <p className="mt-2 text-sm text-slate-700">{item.note}</p>}<Link href={`/admin/cases/${item.complaintId}`} className="mt-3 inline-block text-sm font-bold text-emerald-700 underline">Open original case</Link></div></article>)}</div><dialog ref={dialog} onClose={() => setSelected(null)} className="m-auto max-h-[95vh] w-[min(96vw,1200px)] rounded-xl bg-white p-4 shadow-2xl backdrop:bg-black/75">{selected && <div><div className="mb-3 flex items-center justify-between gap-3"><div><h2 className="font-bold">{selected.reference} · {selected.stage}</h2><p className="text-xs text-slate-600">Uploaded {new Date(selected.createdAt).toLocaleString("en-PK")} by {selected.uploader}</p></div><button type="button" onClick={() => dialog.current?.close()} className="rounded-lg border px-4 py-2 text-sm font-bold">Close</button></div><Media item={selected} large /><Link href={`/admin/cases/${selected.complaintId}`} className="mt-3 inline-block text-sm font-bold text-emerald-700 underline">Open case</Link></div>}</dialog></>;
}
