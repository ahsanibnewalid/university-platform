"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { GraduationCap, LoaderCircle } from "lucide-react";

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={<main className="auth-page auth-page-centered"><div className="auth-card">Loading invitation…</div></main>}>
      <InvitationForm />
    </Suspense>
  );
}

function InvitationForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";
  const [passwordRequired, setPasswordRequired] = useState(true);
  const [checkingInvitation, setCheckingInvitation] = useState(Boolean(token));
  const [institutionName, setInstitutionName] = useState("");
  const [error, setError] = useState(token ? "" : "Invitation link is missing its token.");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/auth/accept-invitation?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        const result = (await response.json()) as {
          error?: string;
          passwordRequired?: boolean;
          institutionName?: string;
        };
        if (!response.ok) throw new Error(result.error ?? "Invitation is invalid or expired.");
        setPasswordRequired(result.passwordRequired === true);
        setInstitutionName(result.institutionName ?? "");
      })
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Invitation is invalid or expired."))
      .finally(() => setCheckingInvitation(false));
  }, [token]);

  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const password = new FormData(event.currentTarget).get("password");
    try {
      const response = await fetch("/api/auth/accept-invitation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...(typeof password === "string" ? { password } : {}) }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Invitation could not be accepted.");
      router.push("/dashboard");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Invitation could not be accepted.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page auth-page-centered">
      <section className="auth-card">
        <Link className="auth-brand" href="/"><span className="brand-mark"><GraduationCap size={22} /></span><span>campus<span>hub</span></span></Link>
        <div className="auth-copy"><h1>Accept your invitation.</h1><p>{institutionName ? `Join ${institutionName} on CampusHub.` : "Set up your campus account."} {passwordRequired ? "Choose a secure password to activate your account." : "Sign in to link this campus role to your account."}</p></div>
        <form className="auth-form" onSubmit={accept}>
          {passwordRequired && <label>Choose a password<input type="password" name="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>}
          <span className="auth-help">{passwordRequired ? "Use at least 12 characters." : "Your existing password stays the same."}</span>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <button className="auth-submit" disabled={loading || !token || checkingInvitation || Boolean(error)}>{loading || checkingInvitation ? <LoaderCircle className="spin-icon" size={17} /> : null}Accept invitation</button>
        </form>
        <div className="auth-footer"><Link href="/login">Back to sign in</Link></div>
      </section>
    </main>
  );
}
