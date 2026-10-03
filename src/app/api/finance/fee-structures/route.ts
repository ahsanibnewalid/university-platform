import { FeeType, Prisma } from "@prisma/client";
import {
  AuthenticationError,
  authErrorResponse,
  assertSameOrigin,
  requireSession,
} from "@/lib/auth";
import {
  financeRoles,
  isPrismaUniqueError,
  readJsonObject,
  recordAudit,
  requiredText,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await requireSession([...financeRoles]);
    const feeStructures = await prisma.feeStructure.findMany({
      where: { institutionId: session.membership.institutionId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      take: 200,
    });
    return Response.json({ feeStructures });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(financeRoles);
    const input = await readJsonObject(request);
    const name = requiredText(input.name, "Fee name", 2, 120);
    const description =
      typeof input.description === "string"
        ? input.description.trim().slice(0, 1000)
        : "";
    const type =
      typeof input.type === "string" &&
      Object.values(FeeType).includes(input.type as FeeType)
        ? (input.type as FeeType)
        : null;
    if (!type) throw new AuthenticationError("Select a valid fee type.", 400);
    if (
      typeof input.amount !== "number" ||
      !Number.isFinite(input.amount) ||
      input.amount < 0.01 ||
      input.amount > 100000000
    ) {
      throw new AuthenticationError("Fee amount must be greater than zero.", 400);
    }
    const amount = new Prisma.Decimal(input.amount);
    if (amount.decimalPlaces() > 2) {
      throw new AuthenticationError("Fee amount can have at most two decimal places.", 400);
    }
    const feeStructure = await prisma.feeStructure.create({
      data: {
        institutionId: session.membership.institutionId,
        name,
        description,
        type,
        amount,
        currency: "BDT",
      },
    });
    await recordAudit(session, "finance.fee_structure.created", "FeeStructure", feeStructure.id);
    return Response.json({ feeStructure }, { status: 201 });
  } catch (error) {
    if (isPrismaUniqueError(error)) {
      return Response.json(
        { error: "A fee structure with that name already exists." },
        { status: 409 },
      );
    }
    return authErrorResponse(error);
  }
}
