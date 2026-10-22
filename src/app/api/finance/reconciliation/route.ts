import { createHash, randomBytes } from "node:crypto";
import { CampusRole, InvoiceStatus, PaymentStatus, Prisma } from "@prisma/client";
import {
  AuthenticationError,
  authErrorResponse,
  assertSameOrigin,
  requireSession,
} from "@/lib/auth";
import { financeRoles, readJsonObject, requiredText } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { validateSslCommerzTransaction } from "@/lib/sslcommerz";

function toVerifiedAmount(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new AuthenticationError("SSLCommerz returned an invalid amount.", 400);
  }
  try {
    const amount = new Prisma.Decimal(String(value));
    if (!amount.isFinite() || amount.decimalPlaces() > 2) {
      throw new Error("Invalid amount precision");
    }
    return amount;
  } catch {
    throw new AuthenticationError("SSLCommerz returned an invalid amount.", 400);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession([...financeRoles, CampusRole.HR]);
    const input = await readJsonObject(request);
    const transactionId = requiredText(input.transactionId, "Payment transaction", 1, 30);

    const initial = await prisma.paymentTransaction.findFirst({
      where: {
        transactionId,
        invoice: { institutionId: session.membership.institutionId },
      },
      include: { invoice: true, payment: true },
    });
    if (!initial) throw new AuthenticationError("Payment transaction not found.", 404);

    if (initial.status === PaymentStatus.SUCCEEDED && initial.payment) {
      return Response.json({ outcome: "already_reconciled", paymentId: initial.payment.id });
    }
    if (initial.status !== PaymentStatus.REVIEW || !initial.validationId) {
      throw new AuthenticationError("Only server-verified payments awaiting review can be reconciled.", 409);
    }
    if (initial.currency !== "BDT" || initial.invoice.currency !== "BDT") {
      throw new AuthenticationError("Siddheswari College reconciliation accepts BDT transactions only.", 400);
    }

    const verified = await validateSslCommerzTransaction(initial.validationId);
    const verifiedAmount = toVerifiedAmount(verified.amount);
    if (
      !["VALID", "VALIDATED"].includes(String(verified.status ?? "").toUpperCase()) ||
      verified.tran_id !== initial.transactionId ||
      verified.val_id !== initial.validationId ||
      verifiedAmount.comparedTo(initial.amount) !== 0 ||
      String(verified.currency ?? "").toUpperCase() !== "BDT"
    ) {
      throw new AuthenticationError("The gateway verification does not match this payment transaction.", 400);
    }

    const payloadHash = createHash("sha256")
      .update(JSON.stringify({
        transactionId: initial.transactionId,
        validationId: initial.validationId,
        status: verified.status,
        amount: verified.amount,
        currency: verified.currency,
        bankTransactionId: verified.bank_tran_id,
      }))
      .digest("hex");

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.paymentTransaction.findFirst({
        where: {
          transactionId,
          invoice: { institutionId: session.membership.institutionId },
        },
        include: { invoice: true, payment: true },
      });
      if (!current) throw new AuthenticationError("Payment transaction not found.", 404);

      if (current.status === PaymentStatus.SUCCEEDED && current.payment) {
        return { outcome: "already_reconciled" as const, paymentId: current.payment.id };
      }
      if (
        current.status !== PaymentStatus.REVIEW ||
        current.validationId !== initial.validationId ||
        current.currency !== "BDT" ||
        current.invoice.currency !== "BDT"
      ) {
        throw new AuthenticationError("Payment state changed; reload reconciliation details before retrying.", 409);
      }
      if (current.invoice.status === InvoiceStatus.CANCELLED) {
        throw new AuthenticationError("Cancelled invoices cannot receive a payment reconciliation.", 409);
      }

      const remaining = current.invoice.totalAmount.sub(current.invoice.paidAmount);
      if (remaining.lessThanOrEqualTo(0) || current.amount.greaterThan(remaining)) {
        throw new AuthenticationError("Payment exceeds the invoice's remaining BDT balance; manual accounting review is required.", 409);
      }

      const claimed = await tx.paymentTransaction.updateMany({
        where: {
          id: current.id,
          status: PaymentStatus.REVIEW,
          validationId: current.validationId,
        },
        data: {
          status: PaymentStatus.SUCCEEDED,
          gatewayTransactionId: typeof verified.bank_tran_id === "string"
            ? verified.bank_tran_id.slice(0, 100)
            : current.gatewayTransactionId,
        },
      });
      if (claimed.count !== 1) {
        const latest = await tx.paymentTransaction.findUnique({
          where: { id: current.id },
          include: { payment: true },
        });
        if (latest?.status === PaymentStatus.SUCCEEDED && latest.payment) {
          return { outcome: "already_reconciled" as const, paymentId: latest.payment.id };
        }
        throw new AuthenticationError("Payment transaction was reconciled concurrently; reload and retry.", 409);
      }

      const payment = await tx.payment.create({
        data: {
          institutionId: current.invoice.institutionId,
          invoiceId: current.invoiceId,
          initiatorId: current.initiatorId,
          transactionId: current.transactionId,
          amount: current.amount,
          currency: "BDT",
          method: typeof verified.card_type === "string"
            ? `SSLCOMMERZ:${verified.card_type.slice(0, 40)}`
            : "SSLCOMMERZ",
        },
      });
      const receiptNumber = `RCP-${Date.now().toString(36).toUpperCase()}-${randomBytes(5).toString("hex").toUpperCase()}`;
      await tx.receipt.create({ data: { paymentId: payment.id, receiptNumber } });

      const paidAmount = current.invoice.paidAmount.add(current.amount);
      await tx.invoice.update({
        where: { id: current.invoiceId },
        data: {
          paidAmount,
          status: paidAmount.equals(current.invoice.totalAmount)
            ? InvoiceStatus.PAID
            : InvoiceStatus.PARTIALLY_PAID,
          ...(current.invoice.checkoutLock === current.transactionId
            ? { checkoutLock: null, checkoutExpiresAt: null }
            : {}),
        },
      });
      await tx.sSLCommerzLog.create({
        data: {
          institutionId: current.invoice.institutionId,
          transactionId: current.transactionId,
          validationId: current.validationId,
          eventType: "manual_reconciliation",
          outcome: "APPLIED",
          payloadHash,
          message: "Finance staff applied a server-verified BDT payment to its invoice.",
        },
      });
      await tx.auditEvent.create({
        data: {
          institutionId: current.invoice.institutionId,
          actorId: session.userId,
          action: "finance.payment.reconciled",
          entityType: "Payment",
          entityId: payment.id,
          metadata: {
            transactionId: current.transactionId,
            invoiceNumber: current.invoice.invoiceNumber,
            amount: current.amount.toFixed(2),
            currency: "BDT",
            receiptNumber,
          },
        },
      });
      return { outcome: "reconciled" as const, paymentId: payment.id, receiptNumber };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return Response.json(result);
  } catch (error) {
    return authErrorResponse(error);
  }
}
