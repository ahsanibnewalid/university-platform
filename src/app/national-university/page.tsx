import Link from "next/link";
import { ArrowLeft, ExternalLink, GraduationCap, Landmark, ShieldCheck } from "lucide-react";

const services = [
  { title: "National University website", description: "Official university announcements, regulations and institutional information.", url: "https://www.nu.ac.bd/" },
  { title: "NU admissions", description: "Check the university's official admissions service for applicable programs and sessions.", url: "https://app11.nu.edu.bd/" },
  { title: "NU examination results", description: "Use the university's official result portal. College dashboards are not the authoritative NU result publisher.", url: "https://result.nu.ac.bd/" },
  { title: "NU syllabus and academic calendar", description: "Use the university website for authorized program syllabuses and academic calendars.", url: "https://www.nu.ac.bd/" },
];

export default function NationalUniversityPage() {
  return <main className="min-h-screen bg-[#f6f8fc] text-slate-800">
    <header className="bg-[#102b5a] text-white"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5"><Link href="/" className="flex items-center gap-2 font-bold"><GraduationCap/> Siddheswari College</Link><Link href="/" className="flex items-center gap-2 text-sm"><ArrowLeft size={16}/> Home</Link></div></header>
    <section className="bg-gradient-to-r from-[#173e80] to-[#277fa7] px-5 py-20 text-white"><div className="mx-auto max-w-6xl"><Landmark size={36}/><p className="mt-6 text-xs font-extrabold uppercase tracking-[.2em] text-blue-100">Affiliation information</p><h1 className="mt-3 text-4xl font-black md:text-5xl">National University, Bangladesh</h1><p className="mt-6 max-w-3xl leading-8 text-blue-100">Siddheswari College&apos;s National University-affiliated higher-education programs follow the relevant NU rules, registration procedures, examination schedules and result publication processes.</p></div></section>
    <div className="mx-auto max-w-6xl px-5 py-16">
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-7"><div className="flex items-center gap-3 text-blue-900"><ShieldCheck/><h2 className="text-lg font-bold">Know which authority governs your program</h2></div><p className="mt-3 leading-7 text-slate-700">HSC and National University programs are separate academic streams. Do not assume that an NU notice, GPA conversion, registration number or exam procedure applies to HSC students. College-level internal assessments are not a replacement for NU-published examination results.</p></div>
      <h2 className="mt-12 text-2xl font-extrabold">Official National University services</h2><div className="mt-6 grid gap-5 md:grid-cols-2">{services.map((service) => <a key={service.title} href={service.url} target="_blank" rel="noopener noreferrer" className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm transition hover:border-blue-300"><span className="inline-flex items-center gap-2 text-lg font-bold text-blue-800">{service.title}<ExternalLink size={17}/></span><p className="mt-3 text-sm leading-7 text-slate-600">{service.description}</p></a>)}</div>
      <div className="mt-12 flex flex-wrap gap-3"><Link href="/academics" className="rounded-xl bg-[#1758b7] px-6 py-3 font-bold text-white">Siddheswari programs</Link><Link href="/notices" className="rounded-xl border border-slate-300 bg-white px-6 py-3 font-bold text-slate-700">College notices</Link></div>
    </div>
  </main>;
}
