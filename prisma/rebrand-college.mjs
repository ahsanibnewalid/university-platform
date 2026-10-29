import { PrismaClient, Prisma } from "@prisma/client";

// Explicit maintenance action for an existing one-college installation that
// was originally initialized with demo or generic branding. Does not create
// new institutions or change user accounts, grades or memberships.
if (process.env.CAMPUS_CONFIRM_REBRAND !== "Siddheswari College") {
  throw new Error("To rebrand the existing college, set CAMPUS_CONFIRM_REBRAND to exactly 'Siddheswari College'.");
}

const prisma = new PrismaClient();
try {
  await prisma.$transaction(async (tx) => {
    const institutions = await tx.institution.findMany({ select: { id: true, name: true, slug: true }, take: 2 });
    if (institutions.length !== 1) {
      throw new Error("Expected exactly one existing college. No changes were made.");
    }
    const institution = institutions[0];
    if (institution.name === "Siddheswari College" && institution.slug === "siddheswari-college") return;
    await tx.institution.update({
      where: { id: institution.id },
      data: { name: "Siddheswari College", slug: "siddheswari-college" },
    });
    await tx.auditEvent.create({
      data: {
        institutionId: institution.id,
        action: "institution.rebranded.by_operator",
        entityType: "Institution",
        entityId: institution.id,
        metadata: { previousName: institution.name, previousSlug: institution.slug },
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  process.stdout.write("Siddheswari College identity verified. Existing memberships and records were preserved.\n");
} finally {
  await prisma.$disconnect();
}
