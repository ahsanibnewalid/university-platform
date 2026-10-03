import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import PlatformDashboard from "./platform-dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string; payment?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const query = await searchParams;
  return (
    <PlatformDashboard
      user={session.user}
      institution={session.membership.institution}
      membershipId={session.membership.id}
      role={session.membership.role}
      initialModule={query.module}
      paymentOutcome={query.payment}
    />
  );
}
