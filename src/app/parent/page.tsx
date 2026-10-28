import { redirect } from "next/navigation";
import { CampusRole } from "@prisma/client";
import { getCurrentSession } from "@/lib/auth";
import ParentPortal from "./parent-portal";

export const dynamic = "force-dynamic";

export default async function ParentPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.membership.role !== CampusRole.PARENT) redirect("/dashboard");
  return (
    <ParentPortal
      parentName={session.user.name}
      institutionName={session.membership.institution.name}
    />
  );
}
