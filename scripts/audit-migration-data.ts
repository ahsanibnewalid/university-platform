import { PrismaClient } from "@prisma/client";

type ProgramRow = {
  id: string;
  name: string;
  code: string;
  level: string;
  programType: string;
};

const prisma = new PrismaClient();
const categories = ["HSC", "HONOURS", "DEGREE", "PROFESSIONAL_HONOURS", "MASTERS"] as const;
type ProgramCategory = (typeof categories)[number];

function classifyProgram(program: ProgramRow): { proposedType: ProgramCategory | null; reason: string } {
  const current = String(program.programType ?? "").trim().toUpperCase();
  if (categories.includes(current as ProgramCategory)) {
    return { proposedType: current as ProgramCategory, reason: "existing enum value" };
  }

  const text = [program.name, program.code, program.level].join(" ").normalize("NFKC").toUpperCase();
  const rules: Array<{ type: ProgramCategory; pattern: RegExp; reason: string }> = [
    { type: "PROFESSIONAL_HONOURS", pattern: /PROFESSIONAL|BBA\s*PROF|CSE\s*PROF|LLB\s*HONOURS/i, reason: "professional-program keywords" },
    { type: "HSC", pattern: /\bHSC\b|HIGHER SECONDARY|XI.?XII|INTERMEDIATE/i, reason: "HSC / higher-secondary keywords" },
    { type: "MASTERS", pattern: /\bMASTERS?\b|\bMASTER\b|\bMBA\b|\bM\.?S\.?S?\b|\bM\.?A\.?\b/i, reason: "postgraduate keywords" },
    { type: "DEGREE", pattern: /\bDEGREE\b|PASS COURSE|BACHELOR OF ARTS PASS/i, reason: "degree-pass keywords" },
    { type: "HONOURS", pattern: /\bHONOU?RS?\b|\bB\.?A\.?\b|\bB\.?S\.?C\.?\b|\bB\.?S\.?S\.?\b|\bB\.?B\.?A\.?\b/i, reason: "honours / undergraduate keywords" },
  ];
  const match = rules.find((rule) => rule.pattern.test(text));
  return match
    ? { proposedType: match.type, reason: match.reason }
    : { proposedType: null, reason: "unclassified: requires registrar review" };
}

async function main() {
  const orphanedFeeRecords = await prisma.$queryRaw<Array<{
    feeRecordId: string;
    studentId: string;
    missingUser: boolean;
    missingStudentProfile: boolean;
  }>>`
    SELECT fr."id" AS "feeRecordId",
           fr."studentId",
           (u."id" IS NULL) AS "missingUser",
           (sp."userId" IS NULL) AS "missingStudentProfile"
    FROM "FeeRecord" fr
    LEFT JOIN "User" u ON u."id" = fr."studentId"
    LEFT JOIN "StudentProfile" sp ON sp."userId" = fr."studentId"
    WHERE u."id" IS NULL OR sp."userId" IS NULL
    ORDER BY fr."createdAt" ASC
  `;

  const programs = await prisma.program.findMany({
    select: { id: true, name: true, code: true, level: true, programType: true },
    orderBy: [{ departmentId: "asc" }, { code: "asc" }],
  });
  const classification = programs.map((program) => ({
    id: program.id,
    code: program.code,
    name: program.name,
    legacyLevel: program.level,
    currentProgramType: program.programType,
    ...classifyProgram(program),
    requiresHumanApproval: true,
  }));

  const report = {
    generatedAt: new Date().toISOString(),
    mode: "READ_ONLY_DRY_RUN",
    feeRecordAudit: {
      count: orphanedFeeRecords.length,
      records: orphanedFeeRecords,
      note: "A missing StudentProfile is flagged for review even when the User FK exists; do not delete or repair records automatically.",
    },
    programClassificationAudit: {
      count: classification.length,
      classifiedCount: classification.filter((item) => item.proposedType !== null).length,
      unresolvedCount: classification.filter((item) => item.proposedType === null).length,
      records: classification,
      categories,
      note: "Suggested mappings are advisory only. Confirm against the Registrar-approved Siddheswari College catalogue before changing production data.",
    },
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (orphanedFeeRecords.length || classification.some((item) => item.proposedType === null)) {
    process.exitCode = 2;
  }
}

main()
  .catch((error: unknown) => {
    console.error("Migration audit failed; no data was changed.", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
