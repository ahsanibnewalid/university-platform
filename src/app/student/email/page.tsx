"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { ArrowRight, MailCheck, ShieldCheck } from "lucide-react";

function StudentEmailForm() {
  const token = useSearchParams().get("token") ?? "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [verified, setVerified] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch("/api/auth/student-email", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email") }),
      });
      const data = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error ?? "Email verification could not be started.");
      setMessage(data.message ?? "Check Gmail for verification instructions.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Verification failed."); }
    finally { setBusy(false); }
  }
  async function verify() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/auth/student-email", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error ?? "Verification failed.");
      setMessage(data.message ?? "Gmail linked successfully."); setVerified(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Verification failed."); }
    finally { setBusy(false); }
  }
  return <main className="college-auth-simple"><section className="college-auth-panel">
    <span className="college-auth-kicker"><MailCheck size={18}/> Student ID stays your primary login</span>
    <h1>{token ? "Verify your Gmail" : "Connect Gmail for more services"}</h1>
    <p>Your student ID and password already let you access Siddheswari College services. Add a verified Gmail address for notifications, password recovery and online payment receipts.</p>
    {error && <p className="auth-error" role="alert">{error}</p>}
    {message && <p className="auth-success" role="status">{message}</p>}
    {token ? <button disabled={busy || verified} className="auth-submit" onClick={() => void verify()}>{verified ? "Verified" : busy ? "Verifying…" : "Confirm Gmail ownership"}<ArrowRight size={16}/></button>
      : <form className="college-auth-form" onSubmit={submit}>
        <label>Gmail address<input name="email" type="email" autoComplete="email" placeholder="you@gmail.com" pattern="[^\s@]+@gmail\.com" required/></label>
        <button disabled={busy} className="auth-submit">{busy ? "Sending…" : "Send Gmail verification"}<ArrowRight size={16}/></button>
      </form>}
    <p className="college-auth-note"><ShieldCheck size={18}/> You can continue without Gmail for basic academic services. Online payments and email recovery require verified email.</p>
    <Link className="college-back-link" href="/dashboard">{verified ? "Continue to dashboard" : "Skip for now · Go to dashboard"}<ArrowRight size={15}/></Link>
  </section></main>;
}

export default function StudentEmailPage() {
  return <Suspense fallback={<main className="college-auth-simple">Loading student Gmail setup…</main>}>
    <StudentEmailForm/>
  </Suspense>;
}
