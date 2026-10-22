import { ProgramType } from "@prisma/client";
import {
  AuthenticationError,
  authErrorResponse,
  assertSameOrigin,
  requireSession,
} from "@/lib/auth";
import {
  administrativeRoles,
  departmentRoles,
  readJsonObject,
  recordAudit,
  requiredText,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await requireSession();
    const programs = await prisma.program.findMany({
      where: { department: { institutionId: session.membership.institutionId } },
      include: { department: { select: { name: true, code: true } } },
      orderBy: { name: "asc" },
      take: 200,
    });
    return Response.json({ programs });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession([...administrativeRoles, ...departmentRoles]);
    const input = await readJsonObject(request);
    const departmentId = requiredText(input.departmentId, "Department", 1, 100);
    const name = requiredText(input.name, "Program name", 2, 120);
    const code = requiredText(input.code, "Program code", 2, 20).toUpperCase();
    const level = requiredText(input.level, "Program level", 2, 50);
    let programType: ProgramType;
    if (input.programType !== undefined) {
      if (typeof input.programType !== "string" ||
          !Object.values(ProgramType).includes(input.programType as ProgramType)) {
        throw new AuthenticationError("Select a valid program type.", 400);
      }
      programType = input.programType as ProgramType;
    } else {
      const normalizedProgram = `${name} ${level}`.toLowerCase();
      programType = normalizedProgram.includes("professional") && normalizedProgram.includes("honours")
        ? ProgramType.PROFESSIONAL_HONOURS
        : normalizedProgram.includes("hsc") || normalizedProgram.includes("higher secondary")
          ? ProgramType.HSC
          : normalizedProgram.includes("master")
            ? ProgramType.MASTERS
            : normalizedProgram.includes("degree")
              ? ProgramType.DEGREE
              : ProgramType.HONOURS;
    }
    const department = await prisma.department.findFirst({
      where: {
        id: departmentId,
        institutionId: session.membership.institutionId,
        ...(departmentRoles.includes(session.membership.role)
          ? { chairId: session.userId }
          : {}),
      },
      select: { id: true },
    });
    if (!department) throw new AuthenticationError("Department not found.", 404);
    const program = await prisma.program.create({
      data: { departmentId, name, code, level, programType },
    });
    await recordAudit(session, "administration.program.created", "Program", program.id);
    return Response.json({ program }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
