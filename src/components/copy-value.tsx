"use client";
import { useState } from "react";
export function CopyValue({ value, label }: { value: string; label: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  return <span className="inline-flex flex-col items-start gap-1"><button type="button" className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-bold text-emerald-800" onClick={async () => { try { await navigator.clipboard.writeText(value); setStatus("copied"); window.setTimeout(() => setStatus("idle"), 3000); } catch { setStatus("error"); } }} aria-label={`Copy ${label}`}>{status === "copied" ? `Copied ${label}` : `Copy ${label}`}</button>{status !== "idle" && <span role="status" aria-live="polite" className={`text-xs ${status === "error" ? "text-red-700" : "text-emerald-800"}`}>{status === "copied" ? `${label} copied to clipboard` : "Copy failed. Please select the value manually."}</span>}</span>;
}
