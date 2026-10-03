import { CampusRole } from "@prisma/client";
import { randomBytes } from "node:crypto";
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
  requiredText,
  studentRoles,
  validDate,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";

const financeReaders: CampusRole[] = [
  ...financeRoles,
  ...studentRoles,
  CampusRole.PARENT,
];

export async function GET() {
  try {
    const session = await requireSession(financeReaders);
    const isFinance = financeRoles.includes(session.membership.role);
    const guardianLinks = isFinance
      ? []
      : session.membership.role === CampusRole.PARENT
        ? await prisma.guardianLink.findMany({
            where: {
              guardianId: session.userId,
              verifiedAt: { not: null },
              student: {
                memberships: {
                  some: {
                    institutionId: session.membership.institutionId,
                    status: "ACTIVE",
                  },
                },
              },
            },
            select: { studentId: true },
          })
        : [];
    const studentIds = isFinance
      ? undefined
      : session.membership.role === CampusRole.PARENT
        ? guardianLinks.map((link) => link.studentId)
        : [session.userId];
    const [invoices, payments, feeStructures, students] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          institutionId: session.membership.institutionId,
          ...(studentIds ? { studentId: { in: studentIds } } : {}),
        },
        include: {
          items: true,
          student: { select: { id: true, name: true, email: true } },
          payments: {
            include: {
              receipt: true,
              refunds: { orderBy: { createdAt: "desc" } },
            },
            orderBy: { paidAt: "desc" },
          },
        },
        orderBy: [{ dueAt: "desc" }, { createdAt: "desc" }],
        take: 100,
      }),
      prisma.payment.findMany({
        where: {
          institutionId: session.membership.institutionId,
          ...(studentIds ? { invoice: { studentId: { in: studentIds } } } : {}),
        },
        include: {
          invoice: {
            select: { id: true, invoiceNumber: true, studentId: true },
          },
          receipt: true,
          refunds: { orderBy: { createdAt: "desc" } },
        },
        orderBy: { paidAt: "desc" },
        take: 100,
      }),
      isFinance
        ? prisma.feeStructure.findMany({
            where: { institutionId: session.membership.institutionId, active: true },
            orderBy: { name: "asc" },
            take: 100,
          })
        : Promise.resolve([]),
      isFinance
        ? prisma.membership.findMany({
            where: {
              institutionId: session.membership.institutionId,
              status: "ACTIVE",
              role: { in: studentRoles },
            },
            select: { user: { select: { id: true, name: true, email: true } } },
            orderBy: { user: { name: "asc" } },
            take: 500,
          })
        : Promise.resolve([]),
    ]);
    return Response.json({
      invoices,
      payments,
      feeStructures,
      students: students.map((membership) => membership.user),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(financeRoles);
    const input = await readJsonObject(request);
    const studentId = requiredText(input.studentId, "Student", 1, 100);
    const feeStructureId = requiredText(input.feeStructureId, "Fee structure", 1, 100);
    const dueAt = validDate(input.dueAt, "Due date");
    const [student, feeStructure] = await Promise.all([
      prisma.membership.findFirst({
        where: {
          userId: studentId,
          institutionId: session.membership.institutionId,
          status: "ACTIVE",
          role: { in: studentRoles },
        },
        select: { userId: true },
      }),
      prisma.feeStructure.findFirst({
        where: {
          id: feeStructureId,
          institutionId: session.membership.institutionId,
          active: true,
        },
      }),
    ]);
    if (!student) throw new AuthenticationError("Active student not found.", 404);
    if (!feeStructure) throw new AuthenticationError("Active fee structure not found.", 404);
    if (feeStructure.currency !== "BDT") {
      throw new AuthenticationError("Online invoice payments currently support BDT only.", 400);
    }
    const invoiceNumber = `CH-${Date.now().toString(36).toUpperCase()}-${randomBytes(4).toString("hex").toUpperCase()}`;
    const invoice = await prisma.$transaction(async (tx) => {
      const createdInvoice = await tx.invoice.create({
        data: {
          institutionId: session.membership.institutionId,
          studentId,
          invoiceNumber,
          dueAt,
          totalAmount: feeStructure.amount,
          currency: feeStructure.currency,
          items: {
            create: {
              feeStructureId: feeStructure.id,
              description: feeStructure.name,
              type: feeStructure.type,
              quantity: 1,
              unitAmount: feeStructure.amount,
              lineAmount: feeStructure.amount,
            },
          },
        },
        include: { items: true },
      });
      await tx.notification.create({
        data: {
          userId: studentId,
          type: "finance.invoice.issued",
          title: "New university invoice",
          body: `Invoice ${createdInvoice.invoiceNumber} is due ${dueAt.toLocaleDateString("en-GB")}.`,
        },
      });
      const guardians = await tx.guardianLink.findMany({
        where: { studentId, verifiedAt: { not: null } },
        select: { guardianId: true },
      });
      if (guardians.length) {
        await tx.notification.createMany({
          data: guardians.map(({ guardianId }) => ({
            userId: guardianId,
            type: "finance.invoice.issued",
            title: "Student invoice issued",
            body: `A new invoice for ${createdInvoice.invoiceNumber} is available.`,
          })),
        });
      }
      await tx.auditEvent.create({
        data: {
          institutionId: session.membership.institutionId,
          actorId: session.userId,
          action: "finance.invoice.issued",
          entityType: "Invoice",
          entityId: createdInvoice.id,
          metadata: {
            invoiceNumber: createdInvoice.invoiceNumber,
            studentId,
            amount: feeStructure.amount.toFixed(2),
            currency: feeStructure.currency,
          },
        },
      });
      return createdInvoice;
    });
    return Response.json({ invoice }, { status: 201 });
  } catch (error) {
    if (isPrismaUniqueError(error)) {
      return Response.json({ error: "An invoice with that number already exists." }, { status: 409 });
    }
    return authErrorResponse(error);
  }
}
