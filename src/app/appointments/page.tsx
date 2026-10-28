import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import AppointmentsClient from "./appointments-client";

export const dynamic = "force-dynamic";

export default async function AppointmentsPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return <AppointmentsClient role={session.membership.role} institutionName={session.membership.institution.name}/>;
}
