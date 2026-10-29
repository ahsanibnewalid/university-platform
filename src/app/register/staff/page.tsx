"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowLeft, ArrowRight, MailCheck, ShieldCheck } from "lucide-react";

export default function StaffRegistrationPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/staff-register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email") }),
      });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not request verification.");
      setMessage(result.message ?? "Check your Gmail for the verification link.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not request verification."); }
    finally { setBusy(false); }
  }
  return <main className="college-auth-simple">
    <section className="college-auth-panel">
      <Link className="college-back-link" href="/login"><ArrowLeft size={16}/> Back to sign in</Link>
      <span className="college-auth-kicker"><MailCheck size={18}/> Siddheswari College · Staff services</span>
      <h1>Register using your approved Gmail</h1>
      <p>Teachers, staff, department leaders and the principal register through Gmail verification. The college must approve your Gmail address and role beforehand.</p>
      <form className="college-auth-form" onSubmit={register}>
        <label>Approved Gmail address<input name="email" type="email" autoComplete="email" placeholder="yourname@gmail.com" pattern="[^\s@]+@gmail\.com" maxLength={254} required/></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {message && <p className="auth-success" role="status">{message}</p>}
        <button disabled={busy} className="auth-submit">{busy ? "Checking…" : "Send Gmail verification"}<ArrowRight size={16}/></button>
      </form>
      <p className="college-auth-note"><ShieldCheck size={18}/> You cannot select or grant yourself a principal, teacher or administrator role. College administration verifies appointments and authorizes Gmail addresses.</p>
    </section>
  </main>;
}
