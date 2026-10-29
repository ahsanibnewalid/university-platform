import { randomBytes, scryptSync } from "node:crypto";
import { PrismaClient, Prisma } from "@prisma/client";

// Trusted-server-only recovery path for a migrated college that never had a
// super administrator. It is deliberately NOT exposed through an HTTP route.
const args = process.argv.slice(2);
const checkOnly = args.length === 1 && args[0] === "--check";
if (args.length > 0 && !checkOnly) {
  throw new Error("Usage: npm run campus:admin-init -- [--check]");
}

const name = process.env.CAMPUS_ADMIN_NAME?.trim() ?? "";
const email = process.env.CAMPUS_ADMIN_EMAIL?.trim().toLowerCase() ?? "";
const password = process.env.CAMPUS_ADMIN_PASSWORD ?? "";

if (!checkOnly) {
  if (process.env.CAMPUS_CONFIRM_FIRST_ADMIN !== "Siddheswari College") {
    throw new Error("Set CAMPUS_CONFIRM_FIRST_ADMIN to exactly 'Siddheswari College'.");
  }
  if (name.length < 2 || name.length > 120) {
    throw new Error("CAMPUS_ADMIN_NAME must contain 2–120 characters.");
  }
  if (email.length > 254 || !/^[^\s@]+@gmail\.com$/.test(email)) {
    throw new Error("CAMPUS_ADMIN_EMAIL must be the approved administrator's Gmail address.");
  }
  if (password.length < 12 || password.length > 128) {
    throw new Error("CAMPUS_ADMIN_PASSWORD must contain 12–128 characters.");
  }
}

const prisma = new PrismaClient();
try {
  const result = await prisma.$transaction(async (tx) => {
    const institutions = await tx.institution.findMany({
      take: 2,
      select: { id: true, name: true, slug: true, singletonKey: true },
    });
    if (institutions.length !== 1 ||
      institutions[0].name !== "Siddheswari College" ||
      institutions[0].slug !== "siddheswari-college" ||
      institutions[0].singletonKey !== 1) {
      throw new Error("Expected exactly one verified Siddheswari College. No accounts were changed.");
    }
    const institutionId = institutions[0].id;
    const [superAdmins, priorInitialization] = await Promise.all([
      tx.membership.count({ where: { institutionId, role: "SUPER_ADMIN" } }),
      tx.auditEvent.count({ where: {
        institutionId,
        action: { in: ["institution.initialized.from_server", "identity.first_super_admin.initialized"] },
      } }),
    ]);

    if (checkOnly) return { superAdmins, priorInitialization, created: false };
    if (superAdmins !== 0 || priorInitialization !== 0) {
      throw new Error("A super administrator exists or was previously initialized. Refusing to grant another account privileges.");
    }
    if (await tx.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new Error("That Gmail address already belongs to a user. Choose a new approved administrator Gmail; existing users are never escalated.");
    }

    const salt = randomBytes(16).toString("hex");
    const passwordHash = `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
    const user = await tx.user.create({
      data: { name, email, passwordHash, emailVerified: new Date() },
    });
    const membership = await tx.membership.create({
      data: { userId: user.id, institutionId, role: "SUPER_ADMIN", status: "ACTIVE" },
    });
    await tx.auditEvent.create({ data: {
      institutionId, actorId: user.id, action: "identity.first_super_admin.initialized",
      entityType: "Membership", entityId: membership.id,
      metadata: { source: "trusted_server_cli" },
    } });
    return { superAdmins: 1, priorInitialization: 1, created: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  if (checkOnly) {
    process.stdout.write(`Verified Siddheswari College. Super-admin memberships: ${result.superAdmins}. Prior initialization records: ${result.priorInitialization}. No data changed.\n`);
  } else if (result.created) {
    process.stdout.write("First Siddheswari College super administrator created. Sign in through /login with the approved Gmail and chosen password.\n");
  }
} finally {
  await prisma.$disconnect();
}
