import { randomBytes } from "node:crypto";
import { InvoiceStatus, PaymentStatus, Prisma } from "@prisma/client";
import { AuthenticationError } from "@/lib/auth";
import { financeRoles } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { validateSslCommerzTransaction } from "@/lib/sslcommerz";

function amountInMinorUnits(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new AuthenticationError("Payment verification returned an invalid amount.", 400);
  }
  try {
    const amount = new Prisma.Decimal(String(value));
    if (!amount.isFinite() || amount.decimalPlaces() > 2) {
      throw new Error("Amount must be a finite value with at most two decimal places.");
    }
    return amount.mul(100).toFixed(0);
  } catch {
    throw new AuthenticationError("Payment verification returned an invalid amount.", 400);
  }
}

async function requireVerifiedDetails(transactionId: string, validationId: string) {
  const transaction = await prisma.paymentTransaction.findUnique({
    where: { transactionId },
    include: { invoice: true },
  });
  if (!transaction) throw new AuthenticationError("Payment transaction was not found.", 404);
  const verified = await validateSslCommerzTransaction(validationId);
  if (
    !["VALID", "VALIDATED"].includes(String(verified.status ?? "").toUpperCase()) ||
    verified.tran_id !== transaction.transactionId ||
    verified.val_id !== validationId ||
    amountInMinorUnits(verified.amount) !== amountInMinorUnits(transaction.amount.toString()) ||
    String(verified.currency ?? "").toUpperCase() !== transaction.currency
  ) {
    throw new AuthenticationError("Payment provider verification did not match the invoice.", 400);
  }
  return { transaction, verified };
}

export async function verifyAndSettleSslCommerzPayment(
  transactionId: string,
  validationId: string,
) {
  const { verified } = await requireVerifiedDetails(
    transactionId,
    validationId,
  );
  return prisma.$transaction(async (tx) => {
    const current = await tx.paymentTransaction.findUnique({
      where: { transactionId },
      include: { invoice: true },
    });
    if (!current) throw new AuthenticationError("Payment transaction was not found.", 404);
    if (
      current.status === PaymentStatus.SUCCEEDED &&
      current.validationId === validationId
    ) {
      return "succeeded" as const;
    }
    if (current.status === PaymentStatus.REVIEW) return "review" as const;
    if (current.status !== PaymentStatus.PENDING) return "not_pending" as const;

    const riskLevel = String(verified.risk_level ?? "0");
    const amount = current.amount;
    const nextPaidAmount = current.invoice.paidAmount.add(amount);
    const requiresReview =
      riskLevel !== "0" ||
      current.invoice.status === InvoiceStatus.CANCELLED ||
      current.invoice.checkoutLock !== current.transactionId ||
      nextPaidAmount.greaterThan(current.invoice.totalAmount);

    const claimed = await tx.paymentTransaction.updateMany({
      where: { id: current.id, status: PaymentStatus.PENDING },
      data: {
        status: requiresReview ? PaymentStatus.REVIEW : PaymentStatus.SUCCEEDED,
        validationId,
        gatewayTransactionId:
          typeof verified.bank_tran_id === "string"
            ? verified.bank_tran_id.slice(0, 100)
            : null,
      },
    });
    if (claimed.count !== 1) {
      const latest = await tx.paymentTransaction.findUnique({
        where: { id: current.id },
        select: { status: true, validationId: true },
      });
      return latest?.status === PaymentStatus.SUCCEEDED &&
        latest.validationId === validationId
        ? "succeeded" as const
        : latest?.status === PaymentStatus.REVIEW
          ? "review" as const
          : "not_pending" as const;
    }

    await tx.invoice.updateMany({
      where: { id: current.invoiceId, checkoutLock: current.transactionId },
      data: { checkoutLock: null, checkoutExpiresAt: null },
    });
    if (requiresReview) {
      const financeMemberships = await tx.membership.findMany({
        where: {
          institutionId: current.invoice.institutionId,
          status: "ACTIVE",
          role: { in: financeRoles },
        },
        select: { userId: true },
      });
      if (financeMemberships.length) {
        await tx.notification.createMany({
          data: financeMemberships.map(({ userId }) => ({
            userId,
            type: "finance.payment.review",
            title: "Payment requires review",
            body: `Payment ${current.transactionId} was verified but needs finance review before being applied.`,
          })),
        });
      }
      await tx.auditEvent.create({
        data: {
          institutionId: current.invoice.institutionId,
          action: "finance.payment.review_required",
          entityType: "PaymentTransaction",
          entityId: current.id,
          metadata: { transactionId: current.transactionId, riskLevel },
        },
      });
      return "review" as const;
    }

    const payment = await tx.payment.create({
      data: {
        institutionId: current.invoice.institutionId,
        invoiceId: current.invoiceId,
        initiatorId: current.initiatorId,
        transactionId: current.transactionId,
        amount,
        currency: current.currency,
        method:
          typeof verified.card_type === "string"
            ? `SSLCOMMERZ:${verified.card_type.slice(0, 40)}`
            : "SSLCOMMERZ",
      },
    });
    const receiptNumber = `RCP-${Date.now().toString(36).toUpperCase()}-${randomBytes(5).toString("hex").toUpperCase()}`;
    await tx.receipt.create({
      data: { paymentId: payment.id, receiptNumber },
    });
    await tx.invoice.update({
      where: { id: current.invoiceId },
      data: {
        paidAmount: nextPaidAmount,
        status: nextPaidAmount.equals(current.invoice.totalAmount)
          ? InvoiceStatus.PAID
          : InvoiceStatus.PARTIALLY_PAID,
        checkoutLock: null,
        checkoutExpiresAt: null,
      },
    });

    const relatedGuardianLinks = await tx.guardianLink.findMany({
      where: {
        studentId: current.invoice.studentId,
        verifiedAt: { not: null },
      },
      select: { guardianId: true },
    });
    const notificationRecipientIds = new Set([
      current.invoice.studentId,
      ...relatedGuardianLinks.map((link) => link.guardianId),
    ]);
    await tx.notification.createMany({
      data: [...notificationRecipientIds].map((userId) => ({
        userId,
        type: "finance.payment.success",
        title: "Fee payment confirmed",
        body: `Payment for invoice ${current.invoice.invoiceNumber} was verified. Receipt ${receiptNumber} is ready.`,
        link: "/dashboard?module=Fees",
      })),
    });
    await tx.auditEvent.create({
      data: {
        institutionId: current.invoice.institutionId,
        actorId: current.initiatorId,
        action: "finance.payment.verified",
        entityType: "Payment",
        entityId: payment.id,
        metadata: {
          transactionId: current.transactionId,
          validationId,
          invoiceNumber: current.invoice.invoiceNumber,
          amount: amount.toFixed(2),
          currency: current.currency,
        },
      },
    });
    return "succeeded" as const;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
