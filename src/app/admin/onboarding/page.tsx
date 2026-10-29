"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowLeft, ClipboardCopy, ShieldCheck } from "lucide-react";

type Program = { id: string; name: string; code: string; department: { name: string } };
type PendingStudent = { studentNumber: string; activationExpiresAt: string | null; user: { name: string } };
type PendingStaff = { id: string; role: string; user: { name: string; email: string } };
type Data = { programs: Program[]; students: PendingStudent[]; staff: PendingStaff[]; canApproveStaff?: boolean };
const employeeRoles = ["TEACHER", "FACULTY", "STAFF", "OFFICE_STAFF", "DEPARTMENT_HEAD", "DEPARTMENT_CHAIR", "PRINCIPAL", "LIBRARIAN", "HR", "EXAM_CONTROLLER", "ACCOUNTANT", "FINANCE_ADMIN"];

export default function CollegeOnboardingPage() {
  const [data, setData] = useState<Data>({ programs: [], students: [], staff: [] });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [issued, setIssued] = useState<{ studentNumber: string; activationCode: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/onboarding", { cache: "no-store" });
    const result = await response.json() as Data & { error?: string };
    if (!response.ok) throw new Error(result.error ?? "Only approved college administrators may access this page.");
    return result;
  }, []);
  useEffect(() => {
    void load().then(setData).catch((failure) => setError(failure instanceof Error ? failure.message : "Cannot load onboarding."));
  }, [load]);

  async function call(method: "POST" | "PATCH", payload: Record<string, unknown>) {
    setBusy(true); setError(""); setMessage(""); setIssued(null);
    try {
      const response = await fetch("/api/admin/onboarding", {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const result = await response.json() as { error?: string; message?: string; studentNumber?: string; activationCode?: string; expiresAt?: string };
      if (!response.ok) throw new Error(result.error ?? "Onboarding could not be completed.");
      if (result.activationCode && result.studentNumber && result.expiresAt) {
        setIssued({ studentNumber: result.studentNumber, activationCode: result.activationCode, expiresAt: result.expiresAt });
        setMessage("Activation code generated. Give it only to the verified student; it will not be displayed again.");
      } else setMessage(result.message ?? "Staff Gmail approved.");
      setData(await load());
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Onboarding failed."); }
    finally { setBusy(false); }
  }
  function studentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void call("POST", { kind: "student", name: form.get("name"), studentNumber: form.get("studentNumber"), programId: form.get("programId") });
  }
  function staffSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void call("POST", { kind: "staff", name: form.get("name"), email: form.get("email"), role: form.get("role") });
  }
  return <main className="college-onboarding-page"><div className="college-onboarding-shell">
    <Link className="college-back-link" href="/dashboard"><ArrowLeft size={16}/> Dashboard</Link>
    <span className="college-auth-kicker"><ShieldCheck size={18}/> Siddheswari College · Registrar workspace</span>
    <h1>Account onboarding</h1>
    <p>Create a college-issued student ID with a one-time activation code, or pre-approve a staff Gmail address. No public registration can create a principal or teacher role.</p>
    {error && <p className="auth-error" role="alert">{error}</p>}
    {message && <p className="auth-success" role="status">{message}</p>}
    {issued && <div className="college-issued-code" role="status">
      <b>Student ID: {issued.studentNumber}</b>
      <code>{issued.activationCode}</code>
      <small>Expires {new Date(issued.expiresAt).toLocaleString("en-BD")}. Share securely with the correct student.</small>
      <button onClick={() => void navigator.clipboard.writeText(`${issued.studentNumber}\n${issued.activationCode}`)}><ClipboardCopy size={15}/> Copy ID and code</button>
    </div>}
    <div className="college-onboarding-grid">
      <section className="college-auth-panel">
        <h2>Issue student ID</h2>
        <p>The student uses this ID and one-time code to choose a password. Gmail is collected later.</p>
        <form className="college-auth-form" onSubmit={studentSubmit}>
          <label>Student name<input name="name" minLength={2} maxLength={120} required/></label>
          <label>College-issued student ID<input name="studentNumber" minLength={2} maxLength={50} required/></label>
          <label>Program<select name="programId" required defaultValue="">
            <option value="" disabled>Select program</option>
            {data.programs.map((program) => <option key={program.id} value={program.id}>{program.name} ({program.code}) · {program.department.name}</option>)}
          </select></label>
          <button className="auth-submit" disabled={busy || !data.programs.length}>Issue student activation code</button>
        </form>
        <h3>Pending students</h3>
        <ul className="college-onboarding-list">{data.students.map((student) => <li key={student.studentNumber}><span><b>{student.user.name}</b><small>{student.studentNumber}</small></span><button disabled={busy} onClick={() => void call("PATCH", { studentNumber: student.studentNumber })}>Replace code</button></li>)}</ul>
      </section>
      <section className="college-auth-panel">
        <h2>Approve staff Gmail</h2>
        <p>Only the approved Gmail holder can complete registration through email verification. Principal approval requires a super administrator.</p>
        <form className="college-auth-form" onSubmit={staffSubmit}>
          <label>Employee name<input name="name" minLength={2} maxLength={120} required/></label>
          <label>Gmail address<input name="email" type="email" placeholder="name@gmail.com" required/></label>
          <label>Appointment / role<select name="role" required>{employeeRoles.map((role) => <option key={role} value={role}>{role.replaceAll("_", " ")}</option>)}</select></label>
          <button className="auth-submit" disabled={busy || !data.canApproveStaff}>Authorize Gmail</button>
        </form>
        {!data.canApproveStaff && <p className="college-auth-note">Only the principal or super administrator can approve staff Gmail accounts.</p>}
        <h3>Awaiting Gmail verification</h3>
        <ul className="college-onboarding-list">{data.staff.map((staff) => <li key={staff.id}><span><b>{staff.user.name}</b><small>{staff.user.email} · {staff.role.replaceAll("_", " ")}</small></span></li>)}</ul>
      </section>
    </div>
  </div></main>;
}
