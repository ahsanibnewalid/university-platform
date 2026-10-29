"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, GraduationCap, LoaderCircle, LockKeyhole, ShieldCheck, Users } from "lucide-react";

type Mode = "login" | "reset";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const payload: Record<string, string> = {};
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") payload[key] = value;
    }
    const endpoint = mode === "reset" ? "/api/auth/password-reset" : "/api/auth/login";
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error || "The request could not be completed.");
      if (mode === "reset") {
        setMessage(result.message ?? "If the account exists, reset instructions will be sent.");
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The request could not be completed.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page auth-page-college">
      <section className="auth-card">
        <Link className="auth-brand" href="/">
          <span className="brand-mark"><GraduationCap size={22} /></span>
          <span className="auth-brand-name">Siddheswari College<small>OFFICIAL COLLEGE PORTAL · DHAKA</small></span>
        </Link>
        <div className="auth-copy">
          <span className="auth-kicker"><ShieldCheck size={14} /> Verified college accounts only</span>
          <h1>{mode === "reset" ? "Reset your password" : "Welcome back to Siddheswari."}</h1>
          <p>
            {mode === "reset"
              ? "Enter your college account email. If it exists, we’ll send a single-use recovery link."
              : "Sign in to access your courses, results, attendance, payments and campus services."}
          </p>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label>College email address<input name="email" type="email" autoComplete="email" maxLength={254} placeholder="you@example.com" required /></label>
          {mode === "login" && <label>Password<input name="password" type="password" autoComplete="current-password" minLength={12} maxLength={128} placeholder="Enter your password" required /></label>}
          {error && <div className="auth-error" role="alert">{error}</div>}
          {message && <div className="auth-success" role="status">{message}</div>}
          <button className="auth-submit" disabled={loading}>
            {loading ? <LoaderCircle className="spin-icon" size={17} /> : null}
            {mode === "reset" ? "Send reset link" : "Sign in to college portal"}
            {!loading && <ArrowRight size={16} />}
          </button>
        </form>

        <div className="auth-links">
          {mode === "login" && (
            <button onClick={() => { setMode("reset"); setError(""); setMessage(""); }}>Forgot password?</button>
          )}
          {mode === "reset" && (
            <button onClick={() => { setMode("login"); setError(""); setMessage(""); }}>Back to sign in</button>
          )}
        </div>

        <div className="auth-access-note"><LockKeyhole size={17}/><p>This portal serves <strong>Siddheswari College only.</strong> Accounts are created or invited by authorized college staff. Public institution registration is disabled.</p></div>
        <div className="auth-footer"><Link href="/"><ArrowLeft size={14}/> College website</Link><Link href="/accept-invitation">Accept an invitation <ArrowRight size={14}/></Link></div>
      </section>
      <aside className="auth-aside">
        <div className="aside-orbit orbit-one" /><div className="aside-orbit orbit-two" />
        <span className="aside-badge"><GraduationCap size={16} /> সিদ্ধেশ্বরী কলেজ · ঢাকা</span>
        <h2>One college.<br/>Every academic journey.</h2>
        <p>HSC education and National University-affiliated higher education, connected through one secure Siddheswari College portal.</p>
        <div className="auth-aside-features"><span><BookOpen size={22}/><b>Academic progress</b><small>Courses, attendance and results</small></span><span><Users size={22}/><b>Our community</b><small>Students, parents and teachers</small></span><span><ShieldCheck size={22}/><b>Trusted access</b><small>Roles approved by the college</small></span></div>
      </aside>
    </main>
  );
}
