"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./parent-portal.module.css";

type Course = { sectionId: string; section: { course: { code: string; title: string }; term: { name: string } } };
type Assignment = { id: string; title: string; dueAt: string; section: { course: { code: string; title: string } } };
type Attendance = { status: string; meeting: { startsAt: string; section: { course: { code: string } } } };
type Result = { id: string; marksObtained?: number | null; grade?: string | null; exam: { title: string; section: { course: { code: string } } } };
type Fee = { id: string; amountDue: string | number; amountPaid?: string | number; dueAt?: string | null; status?: string };
type Child = {
  id: string;
  name: string;
  studentProfile?: { studentNumber: string; academicStatus: string; currentTerm?: { name: string } | null } | null;
  enrollments: Course[];
  upcomingAssignments: Assignment[];
  attendance: Attendance[];
  attendanceRate: number | null;
  results: Result[];
  fees: Fee[];
};
type Dashboard = { children: Child[] };

const date = (value: string) => new Date(value).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric" });
const amount = (value: string | number) => Number(value || 0).toLocaleString("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 });

export default function ParentPortal({ parentName, institutionName }: { parentName: string; institutionName: string }) {
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloading, setReloading] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/dashboard", { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load your family dashboard.");
        const result = data as Dashboard;
        setChildren(result.children ?? []);
        setSelectedId((previous) => result.children?.some((child) => child.id === previous) ? previous : result.children?.[0]?.id ?? "");
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load your family dashboard.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [reloading]);

  const child = children.find((entry) => entry.id === selectedId);
  const outstanding = child?.fees.reduce((total, fee) => total + Math.max(0, Number(fee.amountDue) - Number(fee.amountPaid ?? 0)), 0) ?? 0;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link href="/dashboard" className={styles.brand}><span className={styles.brandMark}>C</span><span>CampusHub <small>Family Portal</small></span></Link>
          <Link href="/dashboard" className={styles.back}>Main dashboard ↗</Link>
        </header>
        <section className={styles.hero}>
          <div><p className={styles.eyebrow}>{institutionName}</p><h1>Welcome, {parentName.split(" ")[0]}.</h1><p>One secure place to stay close to your child&apos;s learning journey.</p></div>
          <div className={styles.heroBadge}>Parent & guardian access<br /><strong>Verified connections only</strong></div>
        </section>
        {loading && <div className={styles.notice} role="status">Loading your family dashboard…</div>}
        {error && <div className={styles.notice} role="alert">{error} <button onClick={() => setReloading((value) => value + 1)}>Try again</button></div>}
        {!loading && !error && !children.length && <section className={styles.empty}><h2>No verified student links yet</h2><p>Request access to a student from the Family portal module in your main dashboard. The student must approve the request before academic information becomes visible.</p><Link href="/dashboard?module=Parents" className={styles.primary}>Manage guardian connections</Link></section>}
        {!loading && !error && child && <>
          <div className={styles.switcher}><div><p className={styles.eyebrow}>YOUR CHILDREN</p><h2>Student overview</h2></div><label>Viewing student <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{children.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label></div>
          <div className={styles.student}><div className={styles.avatar}>{child.name.charAt(0)}</div><div><h3>{child.name}</h3><p>{child.studentProfile?.studentNumber || "Student"} · {child.studentProfile?.currentTerm?.name || "Current academic session"} · {child.studentProfile?.academicStatus || "Enrolled"}</p></div></div>
          <div className={styles.metrics}>
            <article><span>Attendance rate</span><strong>{child.attendanceRate === null ? "—" : `${child.attendanceRate}%`}</strong><small>Recorded class meetings</small></article>
            <article><span>Active courses</span><strong>{child.enrollments.length}</strong><small>Current enrollments</small></article>
            <article><span>Upcoming homework</span><strong>{child.upcomingAssignments.length}</strong><small>Assignments due</small></article>
            <article><span>Recorded fee balance</span><strong>{amount(outstanding)}</strong><small>See invoices for authoritative dues</small></article>
          </div>
          <div className={styles.grid}>
            <section className={styles.panel}><div className={styles.panelHead}><h3>Upcoming homework</h3><span>Due dates</span></div>{child.upcomingAssignments.length ? <ul>{child.upcomingAssignments.slice(0, 6).map((item) => <li key={item.id}><div><strong>{item.title}</strong><small>{item.section.course.code}</small></div><time>{date(item.dueAt)}</time></li>)}</ul> : <p className={styles.muted}>No upcoming assignments.</p>}</section>
            <section className={styles.panel}><div className={styles.panelHead}><h3>Attendance history</h3><span>Recent classes</span></div>{child.attendance.length ? <ul>{child.attendance.slice(0, 6).map((item, index) => <li key={index}><div><strong>{item.meeting.section.course.code}</strong><small>{date(item.meeting.startsAt)}</small></div><span className={item.status === "PRESENT" ? styles.good : styles.status}>{item.status}</span></li>)}</ul> : <p className={styles.muted}>No attendance records yet.</p>}</section>
            <section className={styles.panel}><div className={styles.panelHead}><h3>Examination results</h3><span>Released results</span></div>{child.results.length ? <ul>{child.results.slice(0, 6).map((item) => <li key={item.id}><div><strong>{item.exam.title}</strong><small>{item.exam.section.course.code}</small></div><span>{item.grade ?? (item.marksObtained ?? "—")}</span></li>)}</ul> : <p className={styles.muted}>No released results yet.</p>}</section>
            <section className={styles.panel}><div className={styles.panelHead}><h3>Current courses</h3><span>Enrolled</span></div>{child.enrollments.length ? <ul>{child.enrollments.slice(0, 6).map((item) => <li key={item.sectionId}><div><strong>{item.section.course.title}</strong><small>{item.section.course.code}</small></div><span>{item.section.term.name}</span></li>)}</ul> : <p className={styles.muted}>No current enrollments.</p>}</section>
          </div>
          <p className={styles.privacy}>Only students who have approved your guardian connection appear here. You can <Link href="/leave-requests">request student leave</Link>. For payments and receipts, use <Link href="/dashboard?module=Fees">Fees & payments</Link>.</p>
        </>}
      </div>
    </main>
  );
}
