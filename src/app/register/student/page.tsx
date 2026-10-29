"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowLeft, ArrowRight, GraduationCap, ShieldCheck } from "lucide-react";

export default function StudentRegistrationPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirmPassword") ?? "")) {
      setError("The passwords do not match."); return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/student-register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentNumber: form.get("studentNumber"), password }),
      });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error ?? "Registration could not be completed.");
      setMessage(result.message ?? "Registration submitted for college review.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Registration failed."); }
    finally { setBusy(false); }
  }
  return <main className="college-auth-simple">
    <section className="college-auth-panel">
      <Link className="college-back-link" href="/login"><ArrowLeft size={16}/> Back to sign in</Link>
      <span className="college-auth-kicker"><GraduationCap size={18}/> Siddheswari College · Student services</span>
      <h1>Request student access</h1>
      <p>Use your Siddheswari College student ID and choose a password. Your account becomes active only after an authorized registrar or department reviewer verifies your college identity.</p>
      <form onSubmit={register} className="college-auth-form">
        <label>College student ID<input name="studentNumber" autoComplete="username" minLength={2} maxLength={50} placeholder="Your issued student ID" required/></label>
        <label>Create password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required/></label>
        <label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required/></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {message && <p className="auth-success" role="status">{message} <Link href="/login">Return to login</Link></p>}
        <button disabled={busy} className="auth-submit">{busy ? "Submitting…" : "Request college approval"}<ArrowRight size={16}/></button>
      </form>
      <p className="college-auth-note"><ShieldCheck size={18}/> Your student ID must already exist in the official college roster. Approval is not automatic; the college may ask to inspect your student ID or admission documents. Gmail can be connected after approval.</p>
    </section>
  </main>;
}
