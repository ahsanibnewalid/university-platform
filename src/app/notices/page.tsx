import Link from "next/link";
import { ArrowLeft, GraduationCap, Megaphone } from "lucide-react";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NoticesPage() {
  const institution = await prisma.institution.findFirst({ select: { id: true, name: true } }).catch(() => null);
  const notices = institution
    ? await prisma.announcement.findMany({
        where: { institutionId: institution.id, publishedAt: { lte: new Date() }, audienceRoles: { isEmpty: true } },
        select: { id: true, title: true, body: true, publishedAt: true },
        orderBy: { publishedAt: "desc" },
        take: 100,
      }).catch(() => [])
    : [];
  return <main className="min-h-screen bg-[#f6f8fc] text-slate-800">
    <header className="bg-[#102b5a] text-white"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5"><Link href="/" className="flex items-center gap-2 font-bold"><GraduationCap/> {institution?.name || "CampusHub"}</Link><Link href="/" className="flex items-center gap-2 text-sm"><ArrowLeft size={16}/> Home</Link></div></header>
    <section className="bg-gradient-to-r from-[#17468d] to-[#258ab9] px-5 py-16 text-white"><div className="mx-auto max-w-6xl"><Megaphone size={32}/><h1 className="mt-4 text-4xl font-black">Official notices</h1><p className="mt-3 text-blue-100">Public announcements released by the institution.</p></div></section>
    <div className="mx-auto max-w-6xl px-5 py-14">{notices.length ? <div className="space-y-5">{notices.map((notice) => <article key={notice.id} className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"><time className="text-xs font-bold uppercase tracking-widest text-blue-700">{notice.publishedAt?.toLocaleDateString("en-BD", { day: "numeric", month: "long", year: "numeric" })}</time><h2 className="mt-3 text-xl font-bold">{notice.title}</h2><p className="mt-4 whitespace-pre-wrap text-sm leading-8 text-slate-600">{notice.body}</p></article>)}</div> : <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-slate-600">There are no public notices at this time.</div>}</div>
  </main>;
}
