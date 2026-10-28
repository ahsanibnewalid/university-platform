import Link from "next/link";
import { ArrowLeft, ClipboardCheck, FileText, GraduationCap, ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdmissionsPage() {
  const institution = await prisma.institution.findFirst({ select: { name: true } }).catch(() => null);
  const steps = [
    { title: "Check available programs", details: "Review the current program list and confirm eligibility with the admissions office.", icon: <GraduationCap/> },
    { title: "Read official notices", details: "Admission circulars, application windows and deadlines appear as public notices when officially published.", icon: <FileText/> },
    { title: "Prepare verified documents", details: "Follow the institution's published requirements. Do not submit identity documents through unverified channels.", icon: <ClipboardCheck/> },
    { title: "Use approved application channels", details: "An online admission form is not active on this website yet; use only channels confirmed by the institution.", icon: <ShieldCheck/> },
  ];
  return <main className="min-h-screen bg-[#f6f8fc] text-slate-800">
    <header className="bg-[#102b5a] text-white"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5"><Link href="/" className="flex items-center gap-2 font-bold"><GraduationCap/> {institution?.name || "CampusHub"}</Link><Link href="/" className="flex items-center gap-2 text-sm"><ArrowLeft size={16}/> Home</Link></div></header>
    <section className="bg-gradient-to-r from-[#17468d] to-[#258ab9] px-5 py-20 text-white"><div className="mx-auto max-w-6xl"><p className="text-xs font-bold uppercase tracking-[.2em] text-blue-100">Join our community</p><h1 className="mt-4 text-4xl font-black md:text-5xl">Admissions information</h1><p className="mt-5 max-w-2xl leading-7 text-blue-100">Find programs and public admission announcements in one place.</p></div></section>
    <div className="mx-auto max-w-6xl px-5 py-16"><div className="grid gap-5 md:grid-cols-2">{steps.map((step, index) => <article key={step.title} className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"><div className="flex items-center justify-between"><span className="rounded-xl bg-blue-50 p-3 text-blue-700">{step.icon}</span><span className="text-xs font-bold text-slate-400">STEP {index + 1}</span></div><h2 className="mt-5 text-xl font-bold">{step.title}</h2><p className="mt-3 leading-7 text-slate-600">{step.details}</p></article>)}</div>
      <div className="mt-10 flex flex-wrap gap-3"><Link className="rounded-xl bg-[#1758b7] px-6 py-4 font-bold text-white" href="/academics">View academic programs</Link><Link className="rounded-xl border border-blue-200 bg-white px-6 py-4 font-bold text-blue-800" href="/notices">Read official notices</Link></div>
    </div>
  </main>;
}
