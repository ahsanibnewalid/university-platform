"use client";

import { CampusRole } from "@prisma/client";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Leave = {
  id: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: string;
  reviewNote: string | null;
  student: { id: string; name: string };
  requester: { name: string };
  reviewer: { name: string } | null;
};
type Child = { id: string; name: string };
const studentRoles: CampusRole[] = [CampusRole.STUDENT, CampusRole.MEDICAL_STUDENT, CampusRole.LAW_STUDENT];
const reviewers: CampusRole[] = [CampusRole.TEACHER, CampusRole.FACULTY, CampusRole.PRINCIPAL, CampusRole.REGISTRAR, CampusRole.UNIVERSITY_ADMIN, CampusRole.SUPER_ADMIN, CampusRole.DEPARTMENT_CHAIR];
const readableDate = (value: string) => new Date(value).toLocaleDateString("en-BD", { year: "numeric", month: "short", day: "numeric" });

export default function LeaveRequestsClient({ role, institutionName }: { role: CampusRole; institutionName: string }) {
  const canCreate = role === CampusRole.PARENT || studentRoles.includes(role);
  const canReview = reviewers.includes(role);
  const [requests, setRequests] = useState<Leave[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [studentId, setStudentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [leaveResponse, dashboardResponse] = await Promise.all([
        fetch("/api/leave-requests", { cache: "no-store" }),
        role === CampusRole.PARENT ? fetch("/api/dashboard", { cache: "no-store" }) : Promise.resolve(null),
      ]);
      const leaveData = await leaveResponse.json();
      if (!leaveResponse.ok) throw new Error(leaveData.error || "Unable to load leave requests.");
      setRequests(leaveData.requests || []);
      if (dashboardResponse) {
        const dashboard = await dashboardResponse.json();
        if (!dashboardResponse.ok) throw new Error(dashboard.error || "Unable to load linked students.");
        const verifiedChildren = (dashboard.children || []).map((item: Child) => ({ id: item.id, name: item.name }));
        setChildren(verifiedChildren);
        setStudentId((old) => verifiedChildren.some((child: Child) => child.id === old) ? old : verifiedChildren[0]?.id || "");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => { void load(); }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const formElement = event.currentTarget;\n    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/leave-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(role === CampusRole.PARENT ? { studentId } : {}),
          startDate: form.get("startDate"),
          endDate: form.get("endDate"),
          reason: form.get("reason"),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to submit leave request.");
      setMessage("Leave request submitted for review.");
      formElement.reset();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function review(id: string, status: "APPROVED" | "REJECTED") {
    const reviewNote = window.prompt("Optional review note (maximum 1000 characters):") ?? "";
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/leave-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, reviewNote }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to review request.");
      setMessage("Request reviewed.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="min-h-screen bg-[#f5f7fb] px-5 py-10 text-[#183055]">
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-700">{institutionName}</p><h1 className="mt-2 text-3xl font-extrabold">Student leave requests</h1></div><Link href={role === CampusRole.PARENT ? "/parent" : "/dashboard"} className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold">Back to portal</Link></div>
      {error && <div role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-red-800">{error}</div>}
      {message && <div role="status" className="mb-5 rounded-xl bg-green-50 p-4 text-green-800">{message}</div>}
      {canCreate && <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"><h2 className="text-xl font-bold">Submit a request</h2><p className="mt-2 text-sm text-slate-600">A request does not automatically mark attendance excused. College staff must review it.</p>
        {role === CampusRole.PARENT && !children.length ? <p className="mt-4 text-sm text-amber-700">You need a verified student connection before requesting leave.</p> : <form onSubmit={create} className="mt-5 grid gap-4 md:grid-cols-2">
          {role === CampusRole.PARENT && <label className="grid gap-2 text-sm font-semibold">Student<select value={studentId} onChange={(e) => setStudentId(e.target.value)} className="rounded-lg border border-slate-300 p-3">{children.map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}</select></label>}
          <label className="grid gap-2 text-sm font-semibold">Start date<input name="startDate" type="date" required className="rounded-lg border border-slate-300 p-3"/></label>
          <label className="grid gap-2 text-sm font-semibold">End date<input name="endDate" type="date" required className="rounded-lg border border-slate-300 p-3"/></label>
          <label className="grid gap-2 text-sm font-semibold md:col-span-2">Reason<textarea name="reason" required minLength={10} maxLength={2000} rows={4} className="rounded-lg border border-slate-300 p-3"/></label>
          <button disabled={busy || (role === CampusRole.PARENT && !studentId)} className="rounded-xl bg-blue-700 px-5 py-3 font-bold text-white disabled:opacity-50">Submit leave request</button>
        </form>}
      </section>}
      <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"><h2 className="text-xl font-bold">{canReview ? "Requests to review" : "Request history"}</h2>{loading ? <p className="mt-5 text-slate-500">Loading requests…</p> : !requests.length ? <p className="mt-5 text-slate-500">No leave requests found.</p> : <div className="mt-5 space-y-4">{requests.map((item) => <article key={item.id} className="rounded-xl border border-slate-200 p-5"><div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-bold">{item.student.name}</h3><p className="mt-1 text-sm text-slate-500">{readableDate(item.startDate)} – {readableDate(item.endDate)} · Requested by {item.requester.name}</p></div><span className="h-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{item.status}</span></div><p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{item.reason}</p>{item.reviewNote && <p className="mt-3 text-sm text-slate-500">Review note: {item.reviewNote}</p>}{canReview && item.status === "PENDING" && <div className="mt-4 flex gap-3"><button disabled={busy} onClick={() => void review(item.id, "APPROVED")} className="rounded-lg bg-green-700 px-4 py-2 text-sm font-bold text-white">Approve</button><button disabled={busy} onClick={() => void review(item.id, "REJECTED")} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white">Reject</button></div>}</article>)}</div>}</section>
    </div>
  </main>;
}
