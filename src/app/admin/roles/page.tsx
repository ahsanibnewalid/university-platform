"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ShieldCheck, Users } from "lucide-react";

type Membership = { id: string; userId: string; role: string; status: string;
  user: { name: string; email: string | null; studentProfile: { studentNumber: string } | null } };
type Result = { memberships: Membership[]; canManage: boolean; allowedRoles: string[]; error?: string };
type Department = { id: string; name: string; chair: { name: string } | null };

export default function RolesPage() {
  const [data, setData] = useState<Result>({ memberships: [], canManage: false, allowedRoles: [] });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/roles", { cache: "no-store" });
    const result = await response.json() as Result;
    if (!response.ok) throw new Error(result.error ?? "Role management is unavailable for this account.");
    return result;
  }, []);
  useEffect(() => { void load().then(setData).catch((failure) => setError(String(failure))); }, [load]);
  useEffect(() => {
    void fetch("/api/departments", { cache: "no-store" })
      .then(async (response) => response.ok ? await response.json() as { departments: Department[] } : { departments: [] })
      .then((result) => setDepartments(result.departments))
      .catch(() => setDepartments([]));
  }, []);

  const employees = useMemo(() => {
    const seen = new Set<string>();
    return data.memberships.filter((membership) => {
      if (!membership.user.email || membership.status !== "ACTIVE" || seen.has(membership.userId) ||
        ["STUDENT", "MEDICAL_STUDENT", "LAW_STUDENT", "PARENT"].includes(membership.role)) return false;
      seen.add(membership.userId); return true;
    });
  }, [data.memberships]);
  const chairs = employees.filter((employee) => data.memberships.some((membership) =>
    membership.userId === employee.userId && membership.status === "ACTIVE" &&
    ["DEPARTMENT_CHAIR", "DEPARTMENT_HEAD"].includes(membership.role)));

  async function update(method: "POST" | "PATCH", payload: Record<string, string>) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/roles", { method,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error ?? "Role update failed.");
      setMessage(result.message ?? "Updated.");
      setData(await load());
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Update failed."); }
    finally { setBusy(false); }
  }

  function addRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void update("POST", { userId: String(form.get("userId")), role: String(form.get("role")) });
  }
  async function assignChair(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/departments", { method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId: form.get("departmentId"), chairId: form.get("chairId") }) });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error ?? "Appointment could not be saved.");
      setMessage(result.message ?? "Department chair updated.");
      const list = await fetch("/api/departments", { cache: "no-store" });
      if (list.ok) setDepartments((await list.json() as { departments: Department[] }).departments);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Appointment failed."); }
    finally { setBusy(false); }
  }

  return <main className="college-onboarding-page"><div className="college-onboarding-shell">
    <Link className="college-back-link" href="/dashboard"><ArrowLeft size={16}/> Dashboard</Link>
    <span className="college-auth-kicker"><ShieldCheck size={18}/> Siddheswari College · Administration</span>
    <h1>People &amp; role management</h1>
    <p>Review active and suspended college memberships. Privileged appointments require Super Admin approval, and the Super Admin account cannot be suspended here.</p>
    {error && <p className="auth-error" role="alert">{error}</p>}
    {message && <p className="auth-success" role="status">{message}</p>}
    <div className="college-onboarding-grid">
      <section className="college-auth-panel">
        <h2><Users size={20}/> Staff appointments</h2>
        <p>Assign an additional role only to an employee who already completed verified Gmail registration.</p>
        <form className="college-auth-form" onSubmit={addRole}>
          <label>Approved employee<select name="userId" required defaultValue="">
            <option value="" disabled>Select employee</option>
            {employees.map((item) => <option key={item.userId} value={item.userId}>{item.user.name} · {item.user.email}</option>)}
          </select></label>
          <label>New appointment<select name="role" required defaultValue="">
            <option value="" disabled>Select role</option>
            {data.allowedRoles.map((role) => <option key={role} value={role}>{role.replaceAll("_", " ")}</option>)}
          </select></label>
          <button className="auth-submit" disabled={busy || !data.canManage || !employees.length}>Assign approved role</button>
        </form>
        {!data.canManage && <p className="college-auth-note">Only Super Admin or Principal can manage employee roles.</p>}
        <p className="college-auth-note">For first-time employees, preapprove their Gmail at <Link href="/admin/onboarding">Registration approvals</Link>.</p>
      </section>
      <section className="college-auth-panel">
        <h2>College account memberships</h2>
        <p>Suspending a role immediately blocks access through sessions using that membership.</p>
        <ul className="college-onboarding-list college-membership-list">{data.memberships.map((membership) => <li key={membership.id}>
          <span><b>{membership.user.name}</b><small>{membership.user.email ?? membership.user.studentProfile?.studentNumber ?? "College account"}</small><small>{membership.role.replaceAll("_", " ")} · {membership.status}</small></span>
          {data.canManage && membership.role !== "SUPER_ADMIN" && membership.status !== "INVITED" &&
            <button disabled={busy} onClick={() => {
              const nextStatus = membership.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
              if (window.confirm(`${nextStatus === "SUSPENDED" ? "Suspend" : "Restore"} ${membership.user.name}'s ${membership.role} access?`))
                void update("PATCH", { membershipId: membership.id, status: nextStatus });
            }}>{membership.status === "ACTIVE" ? "Suspend" : "Reactivate"}</button>}
        </li>)}</ul>
      </section>
      <section className="college-auth-panel">
        <h2>Department chair appointments</h2>
        <p>Assign an approved department lead to a department. Only the appointed chair can approve registration requests for that department.</p>
        <form className="college-auth-form" onSubmit={assignChair}>
          <label>Department<select name="departmentId" required defaultValue="">
            <option value="" disabled>Select college department</option>
            {departments.map((item) => <option key={item.id} value={item.id}>{item.name}{item.chair ? ` · Chair: ${item.chair.name}` : ""}</option>)}
          </select></label>
          <label>Approved department lead<select name="chairId" defaultValue="">
            <option value="">No chair (clear appointment)</option>
            {chairs.map((employee) => <option key={employee.userId} value={employee.userId}>{employee.user.name}</option>)}
          </select></label>
          <button className="auth-submit" disabled={busy || !data.canManage || !departments.length}>Save chair appointment</button>
        </form>
      </section>
    </div>
  </div></main>;
}
