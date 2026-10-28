import Link from "next/link";
import { BookOpen, GraduationCap, ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AcademicsPage() {
  const institution = await prisma.institution.findFirst({ select: { id: true, name: true } }).catch(() => null);
  const programs = institution
    ? await prisma.program.findMany({
        where: { department: { institutionId: institution.id } },
        select: { id: true, name: true, code: true, level: true, department: { select: { name: true } } },
        orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
        take: 200,
      }).catch(() => [])
    : [];
  return (
    <main className="min-h-screen bg-[#f6f8fc] text-slate-800">
      <header className="bg-[#102b5a] text-white"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5"><Link href="/" className="flex items-center gap-2 font-bold"><GraduationCap/> {institution?.name || "CampusHub"}</Link><Link href="/" className="flex items-center gap-2 text-sm"><ArrowLeft size={16}/> Home</Link></div></header>
      <section className="bg-gradient-to-r from-[#17468d] to-[#258ab9] px-5 py-18 text-white"><div className="mx-auto max-w-6xl py-12"><p className="text-xs font-bold uppercase tracking-[.2em] text-blue-100">Academic life</p><h1 className="mt-4 text-4xl font-black md:text-5xl">Programs & departments</h1><p className="mt-4 max-w-2xl text-blue-100">Explore the academic offerings currently configured by the institution.</p></div></section>
      <div className="mx-auto max-w-6xl px-5 py-16">
        <div className="mb-8 flex items-center gap-3"><BookOpen className="text-blue-700"/><h2 className="text-2xl font-extrabold">Academic programs</h2></div>
        {programs.length ? <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{programs.map((program) => <article key={program.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">{program.level}</span><h3 className="mt-5 text-lg font-bold">{program.name}</h3><p className="mt-2 text-sm text-slate-500">{program.department.name}</p><p className="mt-5 border-t border-slate-100 pt-4 text-xs font-semibold text-slate-500">Program code: {program.code}</p></article>)}</div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-slate-600">The institution has not published a program catalogue in this system yet. Please contact its admissions office for confirmed offerings.</div>}
        <div className="mt-12 rounded-2xl bg-[#e7eefb] p-8"><h2 className="text-xl font-bold">Interested in applying?</h2><p className="mt-2 text-slate-600">Check admission instructions and contact the institution before submitting documents or fees.</p><Link className="mt-5 inline-block rounded-xl bg-[#1758b7] px-5 py-3 font-bold text-white" href="/admissions">Admissions information</Link></div>
      </div>
    </main>
  );
}
