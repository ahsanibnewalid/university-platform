"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, MailCheck } from "lucide-react";

function StaffActivationForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [details, setDetails] = useState<{ email: string; name: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/auth/staff-register?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { name?: string; email?: string; error?: string };
        if (!response.ok || !result.name || !result.email) throw new Error(result.error ?? "Invalid verification link.");
        setDetails({ name: result.name, email: result.email });
      }).catch((failure) => setError(failure instanceof Error ? failure.message : "Invalid verification link."));
  }, [token]);

  async function activate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirmPassword") ?? "")) { setError("The passwords do not match."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/staff-register", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Staff registration failed.");
      router.push("/dashboard"); router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Registration failed."); }
    finally { setBusy(false); }
  }
  return <main className="college-auth-simple"><section className="college-auth-panel">
    <Link href="/login" className="college-back-link"><ArrowLeft size={16}/> Back to sign in</Link>
    <span className="college-auth-kicker"><MailCheck size={18}/> Verified Gmail registration</span>
    <h1>Activate your staff account</h1>
    <p>{details ? `${details.name}, your approved account ${details.email} can now be activated.` : "Checking your verification link…"}</p>
    {!token && <p className="auth-error" role="alert">This verification link is missing its token.</p>}
    {error && <p className="auth-error" role="alert">{error}</p>}
    {details && <form className="college-auth-form" onSubmit={activate}>
      <label>Choose password<input type="password" name="password" minLength={12} maxLength={128} autoComplete="new-password" required/></label>
      <label>Confirm password<input type="password" name="confirmPassword" minLength={12} maxLength={128} autoComplete="new-password" required/></label>
      <button disabled={busy} className="auth-submit">{busy ? "Activating…" : "Activate approved account"}<ArrowRight size={16}/></button>
    </form>}
  </section></main>;
}

export default function StaffActivationPage() {
  return <Suspense fallback={<main className="college-auth-simple">Checking Gmail verification…</main>}>
    <StaffActivationForm/>
  </Suspense>;
}
