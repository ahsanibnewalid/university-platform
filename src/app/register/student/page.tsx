"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowLeft, ArrowRight, GraduationCap, ShieldCheck } from "lucide-react";

export default function StudentRegistrationPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirmPassword") ?? "")) {
      setError("The passwords do not match."); return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/student-register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentNumber: form.get("studentNumber"),
          activationCode: form.get("activationCode"), password }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Registration could not be completed.");
      router.push("/student/email"); router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Registration failed."); }
    finally { setBusy(false); }
  }
  return <main className="college-auth-simple">
    <section className="college-auth-panel">
      <Link className="college-back-link" href="/login"><ArrowLeft size={16}/> Back to sign in</Link>
      <span className="college-auth-kicker"><GraduationCap size={18}/> Siddheswari College · Student services</span>
      <h1>Activate your student ID</h1>
      <p>Use the student ID and one-time activation code issued by Siddheswari College. Gmail is optional for now and can be verified after registration.</p>
      <form onSubmit={register} className="college-auth-form">
        <label>College student ID<input name="studentNumber" autoComplete="username" minLength={2} maxLength={50} placeholder="Your issued student ID" required/></label>
        <label>College activation code<input name="activationCode" autoComplete="off" minLength={20} maxLength={120} placeholder="One-time code from the college office" required/></label>
        <label>Create password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required/></label>
        <label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required/></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button disabled={busy} className="auth-submit">{busy ? "Activating…" : "Activate student account"}<ArrowRight size={16}/></button>
      </form>
      <p className="college-auth-note"><ShieldCheck size={18}/> Don&apos;t have an activation code? Contact the Siddheswari College admission or registrar office. Knowing someone else&apos;s ID is not enough to create their account.</p>
    </section>
  </main>;
}
