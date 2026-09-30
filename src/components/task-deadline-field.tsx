"use client";

import { useState, type FormEvent } from "react";
import { parseTaskDeadline } from "@/lib/operations/task-deadline";

const guidance = "Enter a future deadline as YYYY-MM-DD HH:MM, using 24-hour Pakistan time (PKT).";

export function TaskDeadlineField() {
  const [error, setError] = useState("");
  function validate(event: FormEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const message = parseTaskDeadline(input.value) ? "" : guidance;
    input.setCustomValidity(message);
    setError(message);
  }
  return <div>
    <label className="field-label" htmlFor="guided-task-deadline">Deadline</label>
    <input id="guided-task-deadline" name="deadline" type="text" inputMode="numeric" autoComplete="off" placeholder="2026-09-29 18:00" className="field-input" aria-describedby="guided-task-deadline-help guided-task-deadline-error" aria-invalid={Boolean(error)} required onBlur={validate} onInvalid={validate} onChange={event => { event.currentTarget.setCustomValidity(""); setError(""); }} />
    <p id="guided-task-deadline-help" className="mt-1 text-xs text-slate-600">YYYY-MM-DD HH:MM · Pakistan time (PKT) · future date</p>
    {error && <p id="guided-task-deadline-error" role="alert" className="form-error mt-1">{error}</p>}
  </div>;
}
