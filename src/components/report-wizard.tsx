"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { categories } from "@/lib/complaints";
import { type Point } from "@/lib/geo-constants";
import { validateCatalogArea, type ReportingCity } from "@/lib/location-validation";
import { addReportPhotos, removeReportPhoto } from "@/lib/report-photos";
import { ReportLocation } from "./report-location";

const steps = ["The issue", "Location", "Photos & details", "Review"];
type ReportForm = { title: string; category: string; description: string; district: string; area: string; manualArea: boolean; streetOrBlock: string; landmark: string; privateDirections: string };
const emptyForm: ReportForm = { title: "", category: "", description: "", district: "", area: "", manualArea: false, streetOrBlock: "", landmark: "", privateDirections: "" };

function PhotoPreview({ file, onRemove, compact = false }: { file: File; onRemove?: () => void; compact?: boolean }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><Image src={url} alt={`Selected report photo: ${file.name}`} width={320} height={180} unoptimized className={`${compact ? "h-24" : "h-36"} w-full object-cover`} /><div className="flex items-center justify-between gap-2 p-2"><span className="truncate text-xs text-slate-600" title={file.name}>{file.name}</span>{onRemove && <button type="button" onClick={onRemove} aria-label={`Remove ${file.name}`} className="text-xs font-bold text-red-700 underline">Remove</button>}</div></div>;
}

export function ReportWizard({ initialError = false, city }: { initialError?: boolean; city: ReportingCity }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<ReportForm>(emptyForm);
  const [areaSearch, setAreaSearch] = useState("");
  const [point, setPoint] = useState<Point | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoErrors, setPhotoErrors] = useState<string[]>([]);
  const [error, setError] = useState(initialError ? "Please check the details and try again." : "");
  const [submitting, setSubmitting] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const submissionKey = useRef<string | null>(null);
  const submittingRef = useRef(false);

  function update<K extends keyof ReportForm>(key: K, value: ReportForm[K]) { setForm(current => ({ ...current, [key]: value })); setError(""); }
  function chooseDistrict(value: string) { setForm(current => ({ ...current, district: value, area: "", manualArea: false })); setAreaSearch(""); setPoint(null); setError(""); }
  function chooseArea(value: string) { setForm(current => ({ ...current, area: value, manualArea: false })); setAreaSearch(value); setPoint(null); setError(""); }
  function validate(currentStep: number): string | null {
    if (currentStep === 1) {
      if (!categories.includes(form.category as typeof categories[number])) return "Choose a category.";
      if (form.title.trim().length < 5 || form.title.trim().length > 120) return "Give the issue a title of 5–120 characters.";
      if (form.description.trim().length < 10 || form.description.trim().length > 2000) return "Describe the problem in 10–2000 characters.";
    }
    if (currentStep === 2) {
      try { validateCatalogArea(city, form.district, form.area, form.manualArea); }
      catch (issue) { return issue instanceof Error ? issue.message : "Choose a valid Karachi area."; }
    }
    if (currentStep === 3) {
      if (form.streetOrBlock.length > 120 || form.landmark.length > 120 || form.privateDirections.length > 300) return "Shorten the extra location details.";
      if (photoErrors.length) return "Review the photo messages below before continuing.";
    }
    return null;
  }
  function continueStep() { const problem = validate(step); if (problem) { setError(problem); return; } setError(""); setStep(current => Math.min(4, current + 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function back() { setError(""); setStep(current => Math.max(1, current - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function addPhotos(files: FileList | null) { if (!files) return; const result = addReportPhotos(photos, Array.from(files)); setPhotos(result.files); setPhotoErrors(result.errors); setError(""); }

  function submit() {
    if (submittingRef.current) return;
    for (const number of [1, 2, 3]) { const problem = validate(number); if (problem) { setStep(number); setError(problem); return; } }
    submittingRef.current = true; setSubmitting(true); setError(""); setUploadPercent(0);
    submissionKey.current ??= crypto.randomUUID();
    const payload = new FormData();
    payload.set("submissionKey", submissionKey.current);
    payload.set("citySlug", city.slug);
    for (const [key, value] of Object.entries(form)) payload.set(key, typeof value === "boolean" ? value ? "1" : "0" : value);
    payload.set("latitude", point ? String(point.latitude) : ""); payload.set("longitude", point ? String(point.longitude) : "");
    for (const photo of photos) payload.append("photos", photo, photo.name);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/reports");
    xhr.upload.onprogress = event => { if (event.lengthComputable) setUploadPercent(Math.round(event.loaded / event.total * 100)); };
    xhr.onload = () => {
      let response: { reference?: string; error?: string } = {};
      try { response = JSON.parse(xhr.responseText); } catch { /* The server may return a non-JSON transport error. */ }
      if (xhr.status >= 200 && xhr.status < 300 && response.reference) { router.push(`/track?ref=${encodeURIComponent(response.reference)}&submitted=1`); return; }
      setError(response.error ?? "The report could not be saved. Please try again; your details and photos are still here.");
      setSubmitting(false); submittingRef.current = false; setUploadPercent(null);
    };
    xhr.onerror = () => { setError("Connection lost. Your report details and photos are still here; please try again."); setSubmitting(false); submittingRef.current = false; setUploadPercent(null); };
    xhr.send(payload);
  }

  const areas = city.districts.find(item => item.name === form.district)?.localities.map(item => item.name) ?? [];
  const results = areas.filter(area => area.toLowerCase().includes(areaSearch.trim().toLowerCase())).slice(0, 12);
  const field = "field-input";
  return <div className="surface-card space-y-6"><div><p className="text-sm font-bold text-emerald-700">Step {step} of 4</p><div className="mt-3 grid grid-cols-4 gap-2" aria-label="Report progress">{steps.map((name, index) => <div key={name} aria-current={step === index + 1 ? "step" : undefined} className={`rounded-lg px-2 py-3 text-center text-xs font-semibold ${step >= index + 1 ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"}`}><span className="block sm:hidden">{index + 1}</span><span className="hidden sm:block">{index + 1}. {name}</span></div>)}</div></div>
    {error && <p className="form-error" role="alert">{error}</p>}

    {step === 1 && <div className="space-y-5"><div><p className="mb-3 text-sm font-bold text-emerald-800">Reporting in Behtar {city.name} · <a href="/cities" className="underline">Choose city</a></p><h2 className="text-xl font-bold">What needs fixing?</h2><p className="mt-1 text-sm text-slate-600">Start with the issue. You can edit every detail before submitting.</p></div><label className="block"><span className="field-label">Issue category *</span><select id="category" className={field} value={form.category} onChange={event => update("category", event.target.value)} required><option value="">Select a category</option>{categories.map(item => <option key={item} value={item}>{item}</option>)}</select></label><label className="block"><span className="field-label">Short issue title *</span><input className={field} value={form.title} onChange={event => update("title", event.target.value)} minLength={5} maxLength={120} placeholder="Broken streetlight near the main road" required /></label><label className="block"><span className="field-label">Describe the problem *</span><textarea className={`${field} min-h-36`} value={form.description} onChange={event => update("description", event.target.value)} minLength={10} maxLength={2000} placeholder="What is happening? Who is affected? Since when?" required /></label></div>}

    {step === 2 && <div className="space-y-5"><div><h2 className="text-xl font-bold">Where is the issue?</h2><p className="mt-1 text-sm text-slate-600">Choose the district first, then search its areas. A map pin is optional for submitting your report. Public map listing requires a recorded pin that our team verifies and approves; a district or area alone cannot create a marker.</p></div><label className="block"><span className="field-label">Karachi district *</span><select className={field} value={form.district} onChange={event => chooseDistrict(event.target.value)} required><option value="">Choose district</option>{city.districts.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label>{form.district && <div><label className="field-label" htmlFor="area-search">Search town or neighborhood *</label><input id="area-search" className={field} value={areaSearch} onChange={event => { setAreaSearch(event.target.value); setForm(current => ({ ...current, area: "" })); setPoint(null); setError(""); }} placeholder="Search this district" maxLength={80} disabled={form.manualArea} />{!form.manualArea && <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-slate-200 p-2" role="listbox" aria-label="Areas in selected district">{results.length ? results.map(item => <button type="button" key={item} role="option" aria-selected={form.area === item} onClick={() => chooseArea(item)} className={`block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-emerald-50 ${form.area === item ? "bg-emerald-50 font-bold text-emerald-800" : ""}`}>{item}</button>) : <p className="p-2 text-sm text-slate-500">Area not listed? Use the manual option below.</p>}</div>}<button type="button" className="mt-3 text-sm font-bold text-emerald-700 underline" onClick={() => { setForm(current => ({ ...current, manualArea: !current.manualArea, area: "" })); setAreaSearch(""); setPoint(null); setError(""); }}>{form.manualArea ? "Choose from the area list" : "Other / My area is not listed"}</button>{form.manualArea && <label className="mt-3 block"><span className="field-label">Enter your area (citizen supplied; team will verify) *</span><input className={field} value={form.area} onChange={event => update("area", event.target.value)} minLength={3} maxLength={80} placeholder="Your Karachi neighborhood" required /></label>}{form.area && !form.manualArea && <p className="mt-2 text-xs font-semibold text-emerald-700">Selected: {form.area}, District {form.district}</p>}</div>}<ReportLocation key={`${form.district}:${form.area}:${form.category}`} point={point} onPointChange={setPoint} district={form.district} area={form.area} category={form.category} title={form.title} description={form.description} citySlug={city.slug} manualArea={form.manualArea} /></div>}

    {step === 3 && <div className="space-y-5"><div><h2 className="text-xl font-bold">Photos and helpful details</h2><p className="mt-1 text-sm leading-6 text-slate-600">Photos are optional. If safe, photograph the issue from a clear angle and include context such as a road sign. Avoid faces, number plates and private homes.</p></div><div className="grid gap-4 sm:grid-cols-2"><label className="block rounded-xl border border-dashed border-emerald-300 bg-emerald-50 p-4"><span className="field-label">Choose from gallery or files</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => { addPhotos(event.target.files); event.target.value = ""; }} className="mt-2 block w-full text-sm" /></label><label className="block rounded-xl border border-dashed border-emerald-300 bg-emerald-50 p-4"><span className="field-label">Take a photo</span><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={event => { addPhotos(event.target.files); event.target.value = ""; }} className="mt-2 block w-full text-sm" /></label></div><p className="text-xs text-slate-600">{photos.length} of 5 photos · JPEG, PNG or WebP · 5 MB maximum per original image. Photos are private to you and authorized staff.</p>{photoErrors.length > 0 && <ul role="alert" className="form-error list-disc pl-5">{photoErrors.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>}{photos.length > 0 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{photos.map((file, index) => <PhotoPreview key={`${file.name}-${file.lastModified}-${index}`} file={file} onRemove={() => { setPhotos(current => removeReportPhoto(current, index)); setPhotoErrors([]); }} />)}</div>}<div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="field-label">Street or block (optional, private)</span><input className={field} value={form.streetOrBlock} onChange={event => update("streetOrBlock", event.target.value)} maxLength={120} placeholder="Street 4, Block A" /></label><label className="block"><span className="field-label">Nearby landmark (optional, private)</span><input className={field} value={form.landmark} onChange={event => update("landmark", event.target.value)} maxLength={120} placeholder="Near the community clinic" /></label></div><label className="block"><span className="field-label">Additional directions (optional, private)</span><textarea className={`${field} min-h-24`} value={form.privateDirections} onChange={event => update("privateDirections", event.target.value)} maxLength={300} placeholder="How can the team find the issue?" /></label></div>}

    {step === 4 && <div className="space-y-5"><div><h2 className="text-xl font-bold">Review your report</h2><p className="mt-1 text-sm text-slate-600">Check the details. Your report is accepted without payment and starts in Submitted status.</p></div><dl className="grid gap-4 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2"><div><dt className="font-bold">Category</dt><dd>{form.category}</dd></div><div><dt className="font-bold">Title</dt><dd>{form.title}</dd></div><div className="sm:col-span-2"><dt className="font-bold">Description</dt><dd className="mt-1 whitespace-pre-wrap">{form.description}</dd></div><div><dt className="font-bold">District</dt><dd>{form.district}</dd></div><div><dt className="font-bold">Town / neighborhood</dt><dd>{form.area}{form.manualArea ? " (citizen supplied; team will verify)" : ""}</dd></div>{form.streetOrBlock && <div><dt className="font-bold">Street / block</dt><dd>{form.streetOrBlock}</dd></div>}{form.landmark && <div><dt className="font-bold">Nearby landmark</dt><dd>{form.landmark}</dd></div>}{form.privateDirections && <div className="sm:col-span-2"><dt className="font-bold">Private directions</dt><dd>{form.privateDirections}</dd></div>}</dl><div className="rounded-xl border border-slate-200 p-4"><h3 className="font-bold">Selected location preview</h3><p className="mt-1 text-sm">{form.area}, District {form.district}</p><p className="mt-1 text-xs text-slate-600">{point ? `Map pin: ${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)} (private)` : "No precise pin. Your report can still be submitted using the selected area, but it cannot appear as a public map marker without a verified and approved location."}</p><button type="button" onClick={() => setStep(2)} className="mt-2 text-sm font-bold text-emerald-700 underline">Edit location</button></div><div><h3 className="font-bold">Photos ({photos.length})</h3>{photos.length ? <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{photos.map((file, index) => <PhotoPreview key={`${file.name}-${file.lastModified}-${index}`} file={file} compact />)}</div> : <p className="mt-2 text-sm text-slate-600">No photos added. You can still submit.</p>}</div><p className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-900">Your exact location and photos are not placed on the public map automatically. Staff review any public display separately.</p>{submitting && <div role="status"><p className="font-semibold">{uploadPercent == null ? "Sending report…" : `Uploading report… ${uploadPercent}%`}</p><progress value={uploadPercent ?? undefined} max={100} className="mt-2 w-full" /></div>}</div>}

    <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-between">{step > 1 ? <button type="button" onClick={back} disabled={submitting} className="min-h-12 rounded-xl border border-slate-300 px-5 text-sm font-bold disabled:opacity-60">Back</button> : <span />}{step < 4 ? <button type="button" onClick={continueStep} className="btn-dark cursor-pointer">Continue</button> : <button type="button" onClick={submit} disabled={submitting} className="btn-dark cursor-pointer disabled:opacity-60">{submitting ? "Submitting…" : "Submit Report"}</button>}</div>
  </div>;
}
