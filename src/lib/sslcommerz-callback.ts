import { createHash } from "node:crypto";
import { PaymentStatus, Prisma } from "@prisma/client";
import { AuthenticationError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyAndSettleSslCommerzPayment } from "@/lib/sslcommerz-settlement";

function formValue(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function readSslCommerzCallback(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new AuthenticationError("Payment provider callback is invalid.", 400);
  }
  const transactionId = formValue(form, "tran_id");
  const validationId = formValue(form, "val_id");
  if (!/^[A-Za-z0-9_-]{1,30}$/.test(transactionId)) {
    throw new AuthenticationError("Payment provider callback is missing a valid transaction ID.", 400);
  }
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(validationId)) {
    return { transactionId, validationId: null };
  }
  return { transactionId, validationId };
}

export async function processSslCommerzCallback(request: Request) {
  const { transactionId, validationId } = await readSslCommerzCallback(request);
  if (!validationId) return "pending" as const;
  return verifyAndSettleSslCommerzPayment(transactionId, validationId);
}

export async function releaseSslCommerzCheckout(request: Request, outcome: "FAILED_RETURN" | "CANCELLED_RETURN") {
  const { transactionId, validationId } = await readSslCommerzCallback(request);
  const payloadHash = createHash("sha256")
    .update(JSON.stringify({ transactionId, validationId, outcome }))
    .digest("hex");

  return prisma.$transaction(async (tx) => {
    const current = await tx.paymentTransaction.findUnique({
      where: { transactionId },
      include: { invoice: true },
    });
    if (!current) {
      throw new AuthenticationError("Payment transaction was not found.", 404);
    }

    const actualOutcome = current.status === PaymentStatus.PENDING
      ? outcome
      : "IGNORED_AFTER_SETTLEMENT";
    if (current.status === PaymentStatus.PENDING) {
      await tx.invoice.updateMany({
        where: { id: current.invoiceId, checkoutLock: current.transactionId },
        data: { checkoutLock: null, checkoutExpiresAt: null },
      });
    }
    await tx.sSLCommerzLog.create({
      data: {
        institutionId: current.invoice.institutionId,
        transactionId: current.transactionId,
        validationId,
        eventType: "checkout_return",
        outcome: actualOutcome,
        payloadHash,
        message: current.status === PaymentStatus.PENDING
          ? "A failure/cancellation return released the checkout lock; the transaction remains pending so a later verified IPN can still be reconciled."
          : "A failure/cancellation return arrived after the transaction left the pending state and did not alter settlement.",
      },
    });
    await tx.auditEvent.create({
      data: {
        institutionId: current.invoice.institutionId,
        action: "finance.payment.checkout_return",
        entityType: "PaymentTransaction",
        entityId: current.id,
        metadata: {
          transactionId: current.transactionId,
          outcome: actualOutcome,
          currency: current.currency,
        },
      },
    });
    return actualOutcome;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
