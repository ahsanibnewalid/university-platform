import { randomBytes, scryptSync } from "node:crypto";
import { PrismaClient, Prisma } from "@prisma/client";

// This command runs only from the trusted server's shell (or an approved
// one-time deployment job). Never expose it through a public HTTP route.
const COLLEGE_NAME = "Siddheswari College";
const COLLEGE_SLUG = "siddheswari-college";

const name = process.env.CAMPUS_ADMIN_NAME?.trim() ?? "";
const email = process.env.CAMPUS_ADMIN_EMAIL?.trim().toLowerCase() ?? "";
const password = process.env.CAMPUS_ADMIN_PASSWORD ?? "";

if (name.length < 2 || name.length > 120) {
  throw new Error("Set CAMPUS_ADMIN_NAME (2–120 characters) for the college's first administrator.");
}
if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error("Set a valid CAMPUS_ADMIN_EMAIL for the college's first administrator.");
}
if (password.length < 12 || password.length > 128) {
  throw new Error("Set CAMPUS_ADMIN_PASSWORD (12–128 characters) securely. No default password exists.");
}

const salt = randomBytes(16).toString("hex");
const passwordHash = `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
const prisma = new PrismaClient();

try {
  await prisma.$transaction(async (tx) => {
    if ((await tx.institution.count()) !== 0) {
      throw new Error("This database already contains a college. Bootstrap refused; no existing accounts or data were changed.");
    }
    const institution = await tx.institution.create({
      data: { singletonKey: 1, name: COLLEGE_NAME, slug: COLLEGE_SLUG },
    });
    const user = await tx.user.create({
      data: { name, email, passwordHash, emailVerified: new Date() },
    });
    await tx.membership.create({
      data: { institutionId: institution.id, userId: user.id, role: "SUPER_ADMIN", status: "ACTIVE" },
    });
    await tx.auditEvent.create({
      data: {
        institutionId: institution.id,
        actorId: user.id,
        action: "institution.initialized.from_server",
        entityType: "Institution",
        entityId: institution.id,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  process.stdout.write("Siddheswari College initialized with one super administrator. Sign in at /login.\n");
} finally {
  await prisma.$disconnect();
}
