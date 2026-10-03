"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { GraduationCap, LoaderCircle } from "lucide-react";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="auth-page auth-page-centered"><div className="auth-card">Loading reset link…</div></main>}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function reset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const password = new FormData(event.currentTarget).get("password");
    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Password could not be reset.");
      setSuccess(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Password could not be reset.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page auth-page-centered">
      <section className="auth-card">
        <Link className="auth-brand" href="/"><span className="brand-mark"><GraduationCap size={22} /></span><span>campus<span>hub</span></span></Link>
        <div className="auth-copy"><h1>Choose a new password.</h1><p>Your password must be at least 12 characters long.</p></div>
        {success ? <div className="auth-success" role="status">Password updated. <Link href="/login">Sign in</Link> with your new password.</div> : (
          <form className="auth-form" onSubmit={reset}>
            <label>New password<input type="password" name="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
            {error && <div className="auth-error" role="alert">{error}</div>}
            <button className="auth-submit" disabled={loading || !token}>{loading ? <LoaderCircle className="spin-icon" size={17} /> : null}Update password</button>
          </form>
        )}
        <div className="auth-footer"><Link href="/login">Back to sign in</Link></div>
      </section>
    </main>
  );
}
