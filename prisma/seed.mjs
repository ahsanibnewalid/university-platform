import { PrismaClient, ProgramType } from "@prisma/client";

const prisma = new PrismaClient();

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value, field, maxLength) {
  if (typeof value !== "string") {
    throw new Error(`Each program requires a string ${field}.`);
  }
  const normalized = value.trim();
  if (normalized.length < 2 || normalized.length > maxLength) {
    throw new Error(`${field} must contain between 2 and ${maxLength} characters.`);
  }
  return normalized;
}

async function main() {
  const institutionSlug = process.env.SEED_INSTITUTION_SLUG?.trim();
  const rawPrograms = process.env.SIDDHESWARI_PROGRAMS_JSON;
  if (!institutionSlug || !rawPrograms) {
    throw new Error(
      "Seeding requires SEED_INSTITUTION_SLUG and SIDDHESWARI_PROGRAMS_JSON. Supply the college's approved program catalogue; grading policies and departments are never invented by this seed.",
    );
  }

  let parsedPrograms;
  try {
    parsedPrograms = JSON.parse(rawPrograms);
  } catch {
    throw new Error("SIDDHESWARI_PROGRAMS_JSON must be valid JSON.");
  }
  if (!Array.isArray(parsedPrograms) || parsedPrograms.length === 0 || parsedPrograms.length > 200) {
    throw new Error("SIDDHESWARI_PROGRAMS_JSON must be an array containing 1 to 200 programs.");
  }

  const institution = await prisma.institution.findUnique({
    where: { slug: institutionSlug },
    select: { id: true, name: true },
  });
  if (!institution) {
    throw new Error(`Institution slug "${institutionSlug}" was not found. Complete the college bootstrap first.`);
  }

  const programs = [];
  const uniqueCodes = new Set();
  for (const item of parsedPrograms) {
    if (!isRecord(item)) throw new Error("Each program seed entry must be an object.");
    const departmentCode = requiredString(item.departmentCode, "departmentCode", 20).toUpperCase();
    const name = requiredString(item.name, "name", 120);
    const code = requiredString(item.code, "code", 20).toUpperCase();
    const level = requiredString(item.level, "level", 50);
    if (typeof item.programType !== "string" ||
        !Object.values(ProgramType).includes(item.programType)) {
      throw new Error(`Program "${name}" must provide one of: ${Object.values(ProgramType).join(", ")}.`);
    }
    const duplicateKey = `${departmentCode}:${code}`;
    if (uniqueCodes.has(duplicateKey)) {
      throw new Error(`Duplicate program code "${code}" for department "${departmentCode}".`);
    }
    uniqueCodes.add(duplicateKey);

    const department = await prisma.department.findFirst({
      where: { institutionId: institution.id, code: departmentCode },
      select: { id: true },
    });
    if (!department) {
      throw new Error(`Department code "${departmentCode}" does not exist in ${institution.name}.`);
    }
    programs.push({
      departmentId: department.id,
      name,
      code,
      level,
      programType: item.programType,
    });
  }

  const result = await prisma.program.createMany({
    data: programs,
    skipDuplicates: true,
  });
  console.log(`Program seed complete for ${institution.name}: ${result.count} created; existing department/code pairs were left unchanged.`);
}

main()
  .catch((error) => {
    console.error("Program seed failed:", error instanceof Error ? error.message : "Unknown seed error");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
