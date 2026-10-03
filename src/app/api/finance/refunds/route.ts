import { CampusRole, PaymentStatus, Prisma, RefundStatus } from "@prisma/client";
import {
  AuthenticationError,
  authErrorResponse,
  assertSameOrigin,
  requireSession,
} from "@/lib/auth";
import {
  financeRoles,
  readJsonObject,
  requiredText,
  studentRoles,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await requireSession([...financeRoles, ...studentRoles, CampusRole.PARENT]);
    const isFinance = financeRoles.includes(session.membership.role);
    const studentIds = isFinance
      ? undefined
      : studentRoles.includes(session.membership.role)
        ? [session.userId]
        : (
            await prisma.guardianLink.findMany({
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
          ).map(({ studentId }) => studentId);
    const refunds = await prisma.refund.findMany({
      where: {
        payment: {
          institutionId: session.membership.institutionId,
          ...(studentIds ? { invoice: { studentId: { in: studentIds } } } : {}),
        },
      },
      include: {
        payment: {
          include: {
            invoice: {
              select: {
                invoiceNumber: true,
                student: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
        requestedBy: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return Response.json({ refunds });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession([...financeRoles, ...studentRoles, CampusRole.PARENT]);
    const input = await readJsonObject(request);
    const paymentId = requiredText(input.paymentId, "Payment", 1, 100);
    const reason = requiredText(input.reason, "Refund reason", 3, 1000);
    if (
      typeof input.amount !== "number" ||
      !Number.isFinite(input.amount) ||
      input.amount < 0.01
    ) {
      throw new AuthenticationError("Refund amount must be greater than zero.", 400);
    }
    const requestedAmount = new Prisma.Decimal(input.amount);
    if (requestedAmount.decimalPlaces() > 2) {
      throw new AuthenticationError("Refund amount can have at most two decimal places.", 400);
    }
    const refund = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({
        where: {
          id: paymentId,
          institutionId: session.membership.institutionId,
          status: PaymentStatus.SUCCEEDED,
        },
        include: { refunds: true, invoice: { select: { studentId: true } } },
      });
      if (!payment) throw new AuthenticationError("Verified payment not found.", 404);
      if (!financeRoles.includes(session.membership.role)) {
        const isStudent = studentRoles.includes(session.membership.role);
        const isAuthorized =
          isStudent && payment.invoice.studentId === session.userId
            ? true
            : await tx.guardianLink.findFirst({
                where: {
                  studentId: payment.invoice.studentId,
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
              });
        if (!isAuthorized) {
          throw new AuthenticationError(
            "You are not authorized to request a refund for this payment.",
            403,
          );
        }
      }
      const alreadyRefunded = payment.refunds
        .filter((item) => item.status !== RefundStatus.REJECTED)
        .reduce((total, item) => total.add(item.amount), new Prisma.Decimal(0));
      if (alreadyRefunded.add(requestedAmount).greaterThan(payment.amount)) {
        throw new AuthenticationError(
          "Refund amount exceeds the payment balance available for refund.",
          400,
        );
      }
      const created = await tx.refund.create({
        data: {
          paymentId: payment.id,
          requestedById: session.userId,
          amount: requestedAmount,
          reason,
        },
      });
      await tx.auditEvent.create({
        data: {
          institutionId: session.membership.institutionId,
          actorId: session.userId,
          action: "finance.refund.requested",
          entityType: "Refund",
          entityId: created.id,
          metadata: { paymentId: payment.id, amount: requestedAmount.toFixed(2) },
        },
      });
      const financeMemberships = await tx.membership.findMany({
        where: {
          institutionId: session.membership.institutionId,
          status: "ACTIVE",
          role: { in: financeRoles },
        },
        select: { userId: true },
      });
      if (financeMemberships.length) {
        await tx.notification.createMany({
          data: [...new Set(financeMemberships.map(({ userId }) => userId))].map((userId) => ({
            userId,
            type: "finance.refund.requested",
            title: "Refund request received",
            body: `A BDT ${requestedAmount.toFixed(2)} refund request is awaiting finance review.`,
            link: "/dashboard?module=Fees",
          })),
        });
      }
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return Response.json({ refund }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(financeRoles);
    const input = await readJsonObject(request);
    const refundId = requiredText(input.refundId, "Refund", 1, 100);
    const status =
      input.status === RefundStatus.COMPLETED || input.status === RefundStatus.REJECTED
        ? input.status
        : null;
    if (!status) {
      throw new AuthenticationError("Refund status must be completed or rejected.", 400);
    }
    const gatewayRefundReference =
      status === RefundStatus.COMPLETED
        ? requiredText(input.gatewayRefundReference, "Gateway refund reference", 1, 100)
        : null;
    const refund = await prisma.$transaction(async (tx) => {
      const current = await tx.refund.findFirst({
        where: {
          id: refundId,
          payment: { institutionId: session.membership.institutionId },
          status: { in: [RefundStatus.REQUESTED, RefundStatus.PROCESSING] },
        },
        select: { id: true, paymentId: true, amount: true },
      });
      if (!current) throw new AuthenticationError("Pending refund request not found.", 404);
      if (status === RefundStatus.COMPLETED) {
        const payment = await tx.payment.findFirst({
          where: { id: current.paymentId, institutionId: session.membership.institutionId },
          include: { invoice: { select: { studentId: true } } },
        });
        if (!payment) throw new AuthenticationError("Payment not found.", 404);
        const refundTotal = await tx.refund.aggregate({
          where: {
            paymentId: current.paymentId,
            id: { not: current.id },
            status: RefundStatus.COMPLETED,
          },
          _sum: { amount: true },
        });
        if (
          (refundTotal._sum.amount ?? new Prisma.Decimal(0))
            .add(current.amount)
            .greaterThan(payment.amount)
        ) {
          throw new AuthenticationError("Completed refunds cannot exceed the payment amount.", 409);
        }
        await tx.notification.create({
          data: {
            userId: payment.invoice.studentId,
            type: "finance.refund.completed",
            title: "Refund recorded",
            body: `A BDT ${current.amount.toFixed(2)} refund has been recorded for a university payment.`,
            link: "/dashboard?module=Fees",
          },
        });
      }
      const updated = await tx.refund.update({
        where: { id: current.id },
        data: {
          status,
          reviewedById: session.userId,
          gatewayRefundReference,
        },
      });
      await tx.auditEvent.create({
        data: {
          institutionId: session.membership.institutionId,
          actorId: session.userId,
          action: status === RefundStatus.COMPLETED
            ? "finance.refund.gateway_confirmed"
            : "finance.refund.rejected",
          entityType: "Refund",
          entityId: updated.id,
          metadata: {
            paymentId: current.paymentId,
            amount: current.amount.toFixed(2),
            gatewayRefundReference,
          },
        },
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return Response.json({ refund });
  } catch (error) {
    return authErrorResponse(error);
  }
}
