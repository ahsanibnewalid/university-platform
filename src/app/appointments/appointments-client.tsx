"use client";

import { CampusRole } from "@prisma/client";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Appointment = {
  id: string;
  requestedAt: string;
  note: string;
  status: string;
  response?: string | null;
  parent: { name: string };
  student: { name: string };
  teacher: { name: string };
};
type Child = { id: string; name: string };
type Teacher = { studentId: string; teacherId: string; name: string };

export default function AppointmentsClient({ role, institutionName }: { role: CampusRole; institutionName: string }) {
  const parent = role === CampusRole.PARENT;
  const teacher = role === CampusRole.TEACHER || role === CampusRole.FACULTY;
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [studentId, setStudentId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/appointments", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load appointments.");
      setAppointments(data.appointments || []);
      setChildren(data.children || []);
      setTeachers(data.teachers || []);
      setStudentId((old) => data.children?.some((child: Child) => child.id === old) ? old : data.children?.[0]?.id || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load appointments.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  const eligible = teachers.filter((item) => item.studentId === studentId);
  const selectedTeacher = eligible.some((item) => item.teacherId === teacherId) ? teacherId : eligible[0]?.teacherId || "";

  async function request(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true); setError(""); setNotice("");
    try {
      const meeting = new Date(String(values.get("requestedAt")));
      if (!Number.isFinite(meeting.getTime())) throw new Error("Choose a valid meeting date.");
      const response = await fetch("/api/appointments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId, teacherId: selectedTeacher,
          requestedAt: meeting.toISOString(), note: values.get("note"),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Appointment request failed.");
      setNotice("Your appointment request was submitted.");
      form.reset();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed.");
    } finally { setBusy(false); }
  }

  async function change(id: string, status: string) {
    const responseNote = teacher ? window.prompt("Optional response to the parent:") : "";
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/appointments", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, response: responseNote || "" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update appointment.");
      setNotice("Appointment updated.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Update failed.");
    } finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-[#f5f7fb] px-5 py-10 text-[#183055]"><div className="mx-auto max-w-5xl">
    <div className="mb-8 flex items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-700">{institutionName}</p><h1 className="mt-2 text-3xl font-extrabold">Parent–teacher appointments</h1></div><Link href={parent ? "/parent" : "/dashboard"} className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold">Back to portal</Link></div>
    {error && <p role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    {notice && <p role="status" className="mb-5 rounded-xl bg-green-50 p-4 text-green-800">{notice}</p>}
    {parent && <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"><h2 className="text-xl font-bold">Request a meeting</h2><p className="mt-2 text-sm leading-7 text-slate-600">Select a verified child and one of their assigned teachers. Meeting times are requests until the teacher confirms them.</p>
      {!children.length ? <p className="mt-4 text-amber-700">No verified child connections available.</p> : <form onSubmit={request} className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold">Student<select value={studentId} onChange={(event) => { setStudentId(event.target.value); setTeacherId(""); }} className="rounded-xl border border-slate-300 p-3">{children.map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-semibold">Assigned teacher<select value={selectedTeacher} onChange={(event) => setTeacherId(event.target.value)} className="rounded-xl border border-slate-300 p-3">{eligible.map((item) => <option key={item.teacherId} value={item.teacherId}>{item.name}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-semibold">Requested date and time<input required type="datetime-local" name="requestedAt" className="rounded-xl border border-slate-300 p-3"/></label>
        <label className="grid gap-2 text-sm font-semibold md:col-span-2">Reason<textarea required minLength={10} maxLength={1000} rows={3} name="note" className="rounded-xl border border-slate-300 p-3"/></label>
        <button disabled={busy || !selectedTeacher} className="rounded-xl bg-blue-700 px-5 py-3 font-bold text-white disabled:opacity-50">Request appointment</button>
      </form>}
      {children.length > 0 && eligible.length === 0 && <p className="mt-3 text-sm text-amber-700">No assigned teacher is available for the selected student.</p>}
    </section>}
    <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"><h2 className="text-xl font-bold">Appointment history</h2>{loading ? <p className="mt-5 text-slate-500">Loading appointments…</p> : appointments.length === 0 ? <p className="mt-5 text-slate-500">No appointments yet.</p> : <div className="mt-5 space-y-4">{appointments.map((item) => <article key={item.id} className="rounded-xl border border-slate-200 p-5"><div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-bold">{item.student.name} · {item.teacher.name}</h3><p className="mt-1 text-sm text-slate-500">{new Date(item.requestedAt).toLocaleString("en-BD")} · Parent: {item.parent.name}</p></div><span className="h-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{item.status}</span></div><p className="mt-3 text-sm text-slate-700">{item.note}</p>{item.response && <p className="mt-3 text-sm text-slate-600">Response: {item.response}</p>}{item.status === "PENDING" && <div className="mt-4 flex gap-3">{teacher && <><button disabled={busy} onClick={() => void change(item.id,"CONFIRMED")} className="rounded-lg bg-green-700 px-4 py-2 text-sm font-bold text-white">Confirm</button><button disabled={busy} onClick={() => void change(item.id,"DECLINED")} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white">Decline</button></>}{parent && <button disabled={busy} onClick={() => void change(item.id,"CANCELLED")} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold">Cancel request</button>}</div>}</article>)}</div>}</section>
  </div></main>;
}
