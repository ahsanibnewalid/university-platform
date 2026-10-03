"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, GraduationCap, LoaderCircle, ShieldCheck } from "lucide-react";

type Mode = "login" | "setup" | "reset";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [setupAvailable, setSetupAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/auth/bootstrap")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not check setup status.");
        const data = (await response.json()) as { setupAvailable?: boolean };
        setSetupAvailable(data.setupAvailable === true);
      })
      .catch(() => setError("Unable to reach the CampusHub server."));
  }, []);

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
    const endpoint =
      mode === "setup"
        ? "/api/auth/bootstrap"
        : mode === "reset"
          ? "/api/auth/password-reset"
          : "/api/auth/login";
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
    <main className="auth-page">
      <section className="auth-card">
        <Link className="auth-brand" href="/">
          <span className="brand-mark"><GraduationCap size={22} /></span>
          <span>campus<span>hub</span></span>
        </Link>
        <div className="auth-copy">
          <span className="auth-kicker"><ShieldCheck size={14} /> A connected campus</span>
          <h1>{mode === "setup" ? "Set up your institution." : mode === "reset" ? "Reset your password." : "Welcome back."}</h1>
          <p>
            {mode === "setup"
              ? "Create your first institution and super-admin account. Setup requires the private bootstrap secret from your environment."
              : mode === "reset"
                ? "We’ll email a single-use password reset link if this account exists."
                : "Sign in to your university community, classes, and campus life."}
          </p>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {mode === "setup" && (
            <>
              <label>Institution name<input name="institutionName" autoComplete="organization" minLength={2} maxLength={120} required /></label>
              <label>Institution URL name or website<input name="institutionSlug" autoCapitalize="none" autoCorrect="off" placeholder="siddheswari-college or https://scd.edu.bd" required /></label>
              <span className="auth-help">Use a short slug or your institution&apos;s website URL.</span>
              <label>Your name<input name="name" autoComplete="name" minLength={2} maxLength={120} required /></label>
            </>
          )}
          <label>Email address<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
          {mode === "setup" && <label>Bootstrap secret<input name="bootstrapSecret" type="password" autoComplete="off" minLength={24} required /></label>}
          {mode !== "reset" && <label>Password<input name="password" type="password" autoComplete={mode === "setup" ? "new-password" : "current-password"} minLength={12} maxLength={128} required /></label>}
          {mode === "setup" && <span className="auth-help">Use at least 12 characters. This account will receive the first super-admin role.</span>}
          {error && <div className="auth-error" role="alert">{error}</div>}
          {message && <div className="auth-success" role="status">{message}</div>}
          <button className="auth-submit" disabled={loading}>
            {loading ? <LoaderCircle className="spin-icon" size={17} /> : null}
            {mode === "setup" ? "Create institution" : mode === "reset" ? "Send reset link" : "Sign in"}
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
          {mode === "login" && setupAvailable && (
            <button onClick={() => { setMode("setup"); setError(""); setMessage(""); }}>Set up a new institution</button>
          )}
        </div>

        <p className="auth-legal">By continuing, you agree to your institution&apos;s acceptable-use and privacy policies.</p>
        <p className="auth-demo-note">Access is provided by your institution. Ask an administrator for an account invitation.</p>
        <div className="auth-footer"><Link href="/accept-invitation">Have an invitation?</Link><span>CampusHub · A better campus, together.</span></div>
      </section>
      <aside className="auth-aside">
        <div className="aside-orbit orbit-one" /><div className="aside-orbit orbit-two" />
        <span className="aside-badge"><GraduationCap size={16} /> NORTHSTAR CAMPUS</span>
        <h2>More than a university portal.</h2>
        <p>One welcoming home for learning, people, opportunities, and everything happening on campus.</p>
        <div className="aside-feature-list"><span>01 <b>Learn together</b></span><span>02 <b>Find your community</b></span><span>03 <b>Make campus yours</b></span></div>
      </aside>
    </main>
  );
}
