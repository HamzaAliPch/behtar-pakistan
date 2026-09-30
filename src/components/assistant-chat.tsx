"use client";

import { brand } from "@/lib/brand";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { AssistantLanguage, AssistantReply } from "@/lib/assistant";

const quick = {
  en: [`How does ${brand.name} work?`, "How do I report an issue?", "What do complaint statuses mean?", "How do I track my complaint?"],
  ur: [`${brand.urduName} کیسے کام کرتا ہے؟`, "مسئلہ کیسے رپورٹ کروں؟", "شکایت کی حیثیت کا کیا مطلب ہے؟", "شکایت کیسے ٹریک کروں؟"],
  "ur-Latn": [`${brand.name} kaise kaam karta hai?`, "Masla kaise report karun?", "Complaint status ka kya matlab hai?", "Apni shikayat kaise track karun?"],
};

type Entry = { id: number; question: string; reply: AssistantReply };
export function AssistantChat({ citySlug = "karachi" }: { citySlug?: string }) {
  const router = useRouter();
  const [language, setLanguage] = useState<AssistantLanguage>("en"), [input, setInput] = useState(""), [entries, setEntries] = useState<Entry[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState(""), [supportNotice, setSupportNotice] = useState("");
  async function escalate() {
    const question = input.trim() || entries.at(-1)?.question || "";
    if (question.length < 10) { setError("Enter a question of at least 10 characters to ask a person."); return; }
    setBusy(true); setError(""); setSupportNotice("");
    try { const response = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: question, language, action: "escalate" }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setSupportNotice(`Your question was sent to ${brand.name} human support. Replies appear on the Help page and in Notifications.`); setInput(""); router.refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not send support request."); }
    finally { setBusy(false); }
  }
  async function ask(question: string) {
    if (question.trim().length < 2 || busy) return;
    setBusy(true); setError("");
    try { const response = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: question, language, city: citySlug }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Help is temporarily unavailable"); setEntries(current => [...current, { id: Date.now(), question, reply: data }]); setInput(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Help is temporarily unavailable"); }
    finally { setBusy(false); }
  }
  return <div className="surface-card mt-7"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold">{brand.assistantName}</h2><p className="mt-1 text-sm text-slate-600">Automated guidance. A human team member handles case decisions and referrals.</p></div><div><label htmlFor="assistant-language" className="field-label">Language</label><select id="assistant-language" value={language} onChange={event => setLanguage(event.target.value as AssistantLanguage)} className="field-input"><option value="en">English</option><option value="ur">اردو</option><option value="ur-Latn">Roman Urdu</option></select></div></div><div className="mt-6 flex flex-wrap gap-2">{quick[language].map(question => <button key={question} type="button" onClick={() => void ask(question)} disabled={busy} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">{question}</button>)}</div><div className="mt-6 max-h-[480px] space-y-5 overflow-y-auto" aria-live="polite">{entries.map(entry => <div key={entry.id} className="rounded-xl border border-slate-100 p-4"><p className="font-semibold text-slate-800">{entry.question}</p><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700" dir={language === "ur" ? "rtl" : "auto"}>{entry.reply.text}</p>{entry.reply.articles?.map(article => <div key={article.title} className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm"><strong>{article.title}</strong><p className="mt-1 whitespace-pre-wrap">{article.content}</p><span className="text-xs text-emerald-800">Published {brand.name} guidance</span></div>)}<div className="mt-3 flex flex-wrap gap-4">{entry.reply.links.map(link => <Link href={link.href} key={link.href} className="text-sm font-bold text-emerald-700 underline">{link.label}</Link>)}</div><p className="mt-2 text-xs text-slate-400">{entry.reply.source === "local" ? "Local guidance" : "Optional AI response — verify details with the team"}</p></div>)}</div><form className="mt-6 flex flex-col gap-3 sm:flex-row" onSubmit={event => { event.preventDefault(); void ask(input); }}><label htmlFor="assistant-question" className="sr-only">Ask a question</label><input id="assistant-question" className="field-input flex-1" value={input} onChange={event => setInput(event.target.value)} minLength={2} maxLength={800} placeholder="Ask about reporting, categories, tracking or your own case reference" required /><button className="btn-dark cursor-pointer" type="submit" disabled={busy}>{busy ? "Thinking…" : "Ask"}</button></form><button type="button" onClick={() => void escalate()} disabled={busy} className="mt-3 rounded-xl border border-emerald-700 px-4 py-3 text-sm font-bold text-emerald-800">Ask human support</button><p className="mt-3 text-xs text-slate-500">To draft a description, start with “Draft: ” and describe what you observed. For category guidance, start with “Category: ”. Never share a password or private home address.</p>{supportNotice && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900" role="status">{supportNotice}</p>}{error && <p className="form-error mt-4" role="alert">{error}</p>}</div>;
}
