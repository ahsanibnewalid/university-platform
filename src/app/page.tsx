import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  redirect((await getCurrentSession()) ? "/dashboard" : "/login");
}
