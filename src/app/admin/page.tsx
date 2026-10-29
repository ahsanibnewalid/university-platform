import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CampusRole, MembershipStatus, StudentRegistrationStatus } from "@prisma/client";
import { GraduationCap, ShieldCheck, Users, BookOpen, ArrowRight, ClipboardCheck } from "lucide-react";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const allowed: CampusRole[] = [CampusRole.SUPER_ADMIN, CampusRole.PRINCIPAL, CampusRole.REGISTRAR, CampusRole.UNIVERSITY_ADMIN];

export default async function CollegeAdministrationPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!allowed.includes(session.membership.role)) notFound();
  const institutionId = session.membership.institutionId;
  const [pendingStudents, pendingStaff, employees, departments, programs] = await Promise.all([
    prisma.studentProfile.count({ where: { registrationStatus: StudentRegistrationStatus.PENDING,
      program: { department: { institutionId } } } }),
    prisma.membership.count({ where: { institutionId, status: MembershipStatus.INVITED,
      role: { in: [CampusRole.TEACHER, CampusRole.FACULTY, CampusRole.STAFF, CampusRole.OFFICE_STAFF,
        CampusRole.PRINCIPAL, CampusRole.REGISTRAR, CampusRole.DEPARTMENT_HEAD, CampusRole.DEPARTMENT_CHAIR] } } }),
    prisma.membership.count({ where: { institutionId, status: MembershipStatus.ACTIVE,
      role: { notIn: [CampusRole.STUDENT, CampusRole.MEDICAL_STUDENT, CampusRole.LAW_STUDENT, CampusRole.PARENT] } } }),
    prisma.department.count({ where: { institutionId } }),
    prisma.program.count({ where: { department: { institutionId } } }),
  ]);
  const metrics = [
    { title: "Student reviews", value: pendingStudents },
    { title: "Staff awaiting Gmail", value: pendingStaff },
    { title: "Active staff roles", value: employees },
    { title: "Departments & programs", value: `${departments} / ${programs}` },
  ];

  return <main className="college-onboarding-page"><div className="college-onboarding-shell">
    <Link className="college-back-link" href="/dashboard">← Back to dashboard</Link>
    <span className="college-auth-kicker"><GraduationCap size={18}/> Siddheswari College · National University affiliated</span>
    <h1>College administration</h1>
    <p>Operational workspace for Siddheswari College. Approvals, staff roles and academic setup are restricted to authorized appointments and recorded for audit.</p>
    <div className="college-admin-metrics">{metrics.map((metric) => <div key={metric.title}><b>{metric.value}</b><small>{metric.title}</small></div>)}</div>
    <div className="college-admin-grid">
      <Link href="/admin/onboarding"><ClipboardCheck size={25}/><h2>Student &amp; staff approvals</h2><p>Issue roster IDs, approve verified student registration requests, and authorize staff Gmail.</p><span>Open approvals <ArrowRight size={16}/></span></Link>
      <Link href="/admin/roles"><Users size={25}/><h2>People &amp; roles</h2><p>Manage verified employee appointments and suspend or restore permitted memberships.</p><span>Manage access <ArrowRight size={16}/></span></Link>
      <Link href="/dashboard?module=Administration"><BookOpen size={25}/><h2>Academic structure</h2><p>Create faculties, departments, college programs and academic terms for HSC and NU courses.</p><span>Configure academics <ArrowRight size={16}/></span></Link>
      <Link href="/dashboard?module=Audit"><ShieldCheck size={25}/><h2>Security &amp; audit</h2><p>Review administrative events and important changes under college approval policies.</p><span>Review audit events <ArrowRight size={16}/></span></Link>
    </div>
  </div></main>;
}
