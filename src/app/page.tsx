import Link from "next/link";
import { ArrowRight, BookOpen, CalendarDays, GraduationCap, Megaphone, ShieldCheck, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [session, institution] = await Promise.all([
    getCurrentSession(),
    prisma.institution.findFirst({ select: { id: true, name: true } }).catch(() => null),
  ]);
  const notices = institution
    ? await prisma.announcement.findMany({
        where: {
          institutionId: institution.id,
          publishedAt: { lte: new Date() },
          audienceRoles: { isEmpty: true },
        },
        select: { id: true, title: true, body: true, publishedAt: true },
        orderBy: { publishedAt: "desc" },
        take: 5,
      }).catch(() => [])
    : [];
  const name = institution?.name || "Siddheswari College";

  return (
    <main className="min-h-screen bg-[#f7f9fc] text-[#182b4a]">
      <div className="bg-[#112a56] px-5 py-2 text-center text-xs font-semibold tracking-wide text-white">
        সিদ্ধেশ্বরী কলেজ · National University of Bangladesh affiliated college
      </div>
      <header className="border-b border-slate-200 bg-white/95">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5">
          <Link href="/" className="flex items-center gap-3 text-xl font-extrabold tracking-tight">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#1758b7] text-white"><GraduationCap size={24} /></span>
            <span>{name}<span className="block text-[11px] font-bold uppercase tracking-[.18em] text-[#527298]">Siddheswari College · Dhaka</span></span>
          </Link>
          <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-5 text-sm font-semibold text-slate-600">
            <a href="#about" className="hover:text-blue-700">About</a>
            <Link href="/academics" className="hover:text-blue-700">Academics</Link>
            <Link href="/admissions" className="hover:text-blue-700">Admissions</Link>
            <Link href="/notices" className="hover:text-blue-700">Notices</Link>
            <Link href={session ? "/dashboard" : "/login"} className="rounded-xl bg-[#1758b7] px-5 py-3 text-white hover:bg-blue-800">{session ? "My dashboard" : "Portal sign in"}</Link>
          </nav>
        </div>
      </header>
      <section className="overflow-hidden bg-gradient-to-br from-[#102c60] via-[#164d98] to-[#238ab5] text-white">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 md:grid-cols-[1.2fr_.8fr] md:items-center md:py-28">
          <div>
            <span className="inline-flex rounded-full border border-white/30 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[.15em]">Siddheswari College · Dhaka</span>
            <h1 className="mt-7 max-w-3xl text-4xl font-black leading-tight tracking-tight md:text-6xl">Your college, connected to every academic journey.</h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-blue-100">A digital home for Siddheswari College students, parents, teachers and administration—supporting HSC and National University-affiliated higher education workflows.</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href={session ? "/dashboard" : "/login"} className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-4 font-bold text-[#15376d]">Open your portal <ArrowRight size={18}/></Link>
              <Link href="/notices" className="rounded-xl border border-white/40 px-6 py-4 font-bold text-white">Latest notices</Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4" aria-label="Digital campus features">
            {[
              { icon: <GraduationCap size={27}/>, title: "Students", text: "Classes, assignments & results" },
              { icon: <Users size={27}/>, title: "Parents", text: "Verified child progress access" },
              { icon: <BookOpen size={27}/>, title: "Teachers", text: "Academic workflow tools" },
              { icon: <ShieldCheck size={27}/>, title: "Administration", text: "Role-aware campus management" },
            ].map((item) => <div key={item.title} className="rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur-sm"><div className="mb-5 text-sky-200">{item.icon}</div><h2 className="text-lg font-bold">{item.title}</h2><p className="mt-2 text-sm leading-relaxed text-blue-100">{item.text}</p></div>)}
          </div>
        </div>
      </section>
      <section id="about" className="mx-auto max-w-7xl px-5 py-18 md:py-24">
        <div className="max-w-2xl"><p className="text-xs font-extrabold uppercase tracking-[.2em] text-blue-700">One school community</p><h2 className="mt-3 text-3xl font-extrabold md:text-4xl">Everything in one connected place.</h2><p className="mt-5 text-base leading-8 text-slate-600">Built around Siddheswari College, Dhaka, with a distinct HSC academic stream and National University-affiliated degree pathways. Each user signs in with an assigned role; guardians see only verified, linked students.</p></div>
        <div id="academics" className="mt-10 grid gap-5 md:grid-cols-3">
          {[
            { icon: <BookOpen size={24}/>, heading: "Academic management", desc: "Course schedules, homework, examination records and attendance in one workflow." },
            { icon: <Users size={24}/>, heading: "Family portal", desc: "Parents can review linked students’ academic activity and available fee information." },
            { icon: <CalendarDays size={24}/>, heading: "Campus communication", desc: "Official notices, events, messages and timely updates for the school community." },
          ].map((item) => <article key={item.heading} className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"><div className="mb-5 inline-flex rounded-xl bg-blue-50 p-3 text-blue-700">{item.icon}</div><h3 className="text-xl font-bold">{item.heading}</h3><p className="mt-3 leading-7 text-slate-600">{item.desc}</p></article>)}
        </div>
      </section>
      <section id="notices" className="bg-white py-20">
        <div className="mx-auto max-w-7xl px-5">
          <div className="mb-9 flex items-center gap-3"><span className="rounded-xl bg-blue-50 p-3 text-blue-700"><Megaphone /></span><div><p className="text-xs font-bold uppercase tracking-widest text-blue-700">News & updates</p><h2 className="text-3xl font-extrabold">Latest public notices</h2></div></div>
          {notices.length ? <ul className="grid gap-4">{notices.map((notice) => <li key={notice.id} className="rounded-xl border border-slate-200 p-6"><div className="flex flex-wrap items-start justify-between gap-3"><h3 className="text-lg font-bold">{notice.title}</h3><time className="text-xs text-slate-500">{notice.publishedAt?.toLocaleDateString("en-BD")}</time></div><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-600">{notice.body.length > 500 ? notice.body.slice(0, 500) + "…" : notice.body}</p></li>)}</ul> : <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-slate-600">No public notices are published yet. Official announcements will appear here when an administrator publishes them for everyone.</div>}
        </div>
      </section>
      <footer className="bg-[#10254b] px-5 py-10 text-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4"><div><strong>{name}</strong><p className="mt-2 text-xs text-blue-200">Affiliated with National University, Bangladesh (higher-education programs) · Powered by CampusHub</p></div><Link href={session ? "/dashboard" : "/login"} className="text-sm font-semibold underline underline-offset-4">Portal access</Link></div></footer>
    </main>
  );
}
