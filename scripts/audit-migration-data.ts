import { PrismaClient, type ProgramType } from "@prisma/client";

const prisma = new PrismaClient();
const categories = ["HSC", "HONOURS", "DEGREE", "PROFESSIONAL_HONOURS", "MASTERS"] as const;
type Category = (typeof categories)[number];

type Classification = { suggested: Category | null; confidence: "high" | "medium" | "review"; reason: string };

function classifyProgram(values: string[]): Classification {
  const text = values.join(" ").normalize("NFKC").toUpperCase().replace(/[._-]+/g, " ");
  if (/\b(HSC|HIGHER SECONDARY|XI XII|INTERMEDIATE)\b/.test(text)) return { suggested: "HSC", confidence: "high", reason: "HSC / higher-secondary marker" };
  if (/\b(PROFESSIONAL HONOURS|PROFESSIONAL HONORS|PROFESSIONAL BACHELOR)\b/.test(text)) return { suggested: "PROFESSIONAL_HONOURS", confidence: "high", reason: "professional honours marker" };
  if (/\b(MASTERS|MASTER OF|M\.A\b|M\.SC\b|M\.COM\b|MBA\b|LL\.M\b)\b/.test(text)) return { suggested: "MASTERS", confidence: "high", reason: "postgraduate marker" };
  if (/\b(HONOURS|HONORS|BACHELOR OF|B\.A\b|B\.SC\b|B\.COM\b|BBA\b|LL\.B\b)\b/.test(text)) return { suggested: "HONOURS", confidence: "medium", reason: "honours / bachelor marker; verify professional track" };
  if (/\b(DEGREE|PASS COURSE|DEGREE PASS)\b/.test(text)) return { suggested: "DEGREE", confidence: "high", reason: "degree/pass-course marker" };
  return { suggested: null, confidence: "review", reason: "No safe classification rule matched; manual review required" };
}

async function main() {
  // Raw SQL deliberately detects historical orphans even if an import disabled constraints.
  const orphanedFees = await prisma.$queryRaw<Array<{ id: string; studentId: string; institutionId: string }>>`
    SELECT f."id", f."studentId", f."institutionId"
    FROM "FeeRecord" f
    LEFT JOIN "User" u ON u."id" = f."studentId"
    WHERE u."id" IS NULL
    ORDER BY f."institutionId", f."studentId"
  `;

  const programs = await prisma.program.findMany({
    select: {
      id: true, name: true, code: true, level: true, programType: true,
      department: { select: { name: true } },
    },
    orderBy: [{ department: { name: "asc" } }, { code: "asc" }],
  });
  const classification = programs.map((program) => {
    const result = classifyProgram([program.name, program.code, program.level, program.department.name]);
    return {
      id: program.id,
      department: program.department.name,
      name: program.name,
      code: program.code,
      legacyLevel: program.level,
      currentProgramType: program.programType satisfies ProgramType,
      ...result,
      needsReview: result.suggested === null || result.confidence !== "high" || result.suggested !== program.programType,
    };
  });
  const report = {
    generatedAt: new Date().toISOString(),
    mode: "read-only dry run; no database rows are modified",
    summary: {
      feeRecordsOrphaned: orphanedFees.length,
      programsScanned: programs.length,
      programsNeedingReview: classification.filter((p) => p.needsReview).length,
      unmatchedPrograms: classification.filter((p) => p.suggested === null).length,
    },
    orphanedFeeRecords: orphanedFees,
    programClassification: classification,
    allowedCategories: categories,
  };
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (orphanedFees.length || classification.some((p) => p.needsReview)) {
    process.exitCode = 2;
  }
}

main().catch((error: unknown) => {
  console.error("Migration data audit failed:", error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
