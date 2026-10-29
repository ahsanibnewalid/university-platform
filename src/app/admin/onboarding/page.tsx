"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowLeft, ShieldCheck } from "lucide-react";

type Program = { id: string; name: string; code: string; department: { name: string } };
type PendingStudent = { studentNumber: string; registrationStatus: "NOT_REQUESTED" | "PENDING" | "REJECTED"; registrationRequestedAt: string | null; program: { name: string }; user: { name: string } };
type PendingStaff = { id: string; role: string; user: { name: string; email: string } };
type Data = { programs: Program[]; students: PendingStudent[]; staff: PendingStaff[]; canApproveStaff?: boolean };
const employeeRoles = ["TEACHER", "FACULTY", "STAFF", "OFFICE_STAFF", "DEPARTMENT_HEAD", "DEPARTMENT_CHAIR", "PRINCIPAL", "LIBRARIAN", "HR", "EXAM_CONTROLLER", "ACCOUNTANT", "FINANCE_ADMIN"];

export default function CollegeOnboardingPage() {
  const [data, setData] = useState<Data>({ programs: [], students: [], staff: [] });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [verified, setVerified] = useState<string[]>([]);
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
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/onboarding", {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error ?? "Onboarding could not be completed.");
      setMessage(result.message ?? "College record updated.");
      setVerified([]);
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
    <h1>Registration approvals</h1>
    <p>Add student IDs to the official roster, review student password-registration requests, and preapprove employee Gmail accounts. Every approval is role-restricted and audited.</p>
    {error && <p className="auth-error" role="alert">{error}</p>}
    {message && <p className="auth-success" role="status">{message}</p>}
    <div className="college-onboarding-grid">
      <section className="college-auth-panel">
        <h2>College student roster</h2>
        <p>Add the student&apos;s official ID and program first. The student then submits their ID and password for an authorized reviewer to approve.</p>
        <form className="college-auth-form" onSubmit={studentSubmit}>
          <label>Student name<input name="name" minLength={2} maxLength={120} required/></label>
          <label>College-issued student ID<input name="studentNumber" minLength={2} maxLength={50} required/></label>
          <label>Program<select name="programId" required defaultValue="">
            <option value="" disabled>Select program</option>
            {data.programs.map((program) => <option key={program.id} value={program.id}>{program.name} ({program.code}) · {program.department.name}</option>)}
          </select></label>
          <button className="auth-submit" disabled={busy || !data.programs.length}>Add student to roster</button>
        </form>
        {!data.programs.length && <p className="college-auth-note">Create a department and program in the Administration dashboard before adding students.</p>}
        <h3>Student registration review</h3>
        <ul className="college-onboarding-list">{data.students.map((student) => <li key={student.studentNumber} className="college-review-row">
          <span><b>{student.user.name}</b><small>{student.studentNumber} · {student.program.name} · {student.registrationStatus.replaceAll("_", " ")}</small></span>
          {student.registrationStatus === "PENDING" && <div className="college-review-actions">
            <label><input type="checkbox" checked={verified.includes(student.studentNumber)} onChange={(event) => setVerified((current) => event.target.checked ? [...current, student.studentNumber] : current.filter((id) => id !== student.studentNumber))}/> Checked official student identity</label>
            <button disabled={busy || !verified.includes(student.studentNumber)} onClick={() => void call("PATCH", { action: "approve", studentNumber: student.studentNumber, identityVerified: true })}>Approve</button>
            <button disabled={busy} onClick={() => { if (window.confirm(`Reject registration request for ${student.studentNumber}?`)) void call("PATCH", { action: "reject", studentNumber: student.studentNumber }); }}>Reject</button>
          </div>}
        </li>)}</ul>
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
