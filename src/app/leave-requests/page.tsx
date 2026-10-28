import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import LeaveRequestsClient from "./leave-requests-client";

export const dynamic = "force-dynamic";

export default async function LeaveRequestsPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return <LeaveRequestsClient role={session.membership.role} institutionName={session.membership.institution.name} />;
}
