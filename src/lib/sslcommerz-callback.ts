import { createHash } from "node:crypto";
import { verifySslCommerzVerifySign } from "@/lib/sslcommerz-signature";
import { PaymentStatus, Prisma } from "@prisma/client";
import { AuthenticationError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyAndSettleSslCommerzPayment } from "@/lib/sslcommerz-settlement";

function formValue(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function validateSslCommerzIpnHash(form: FormData) {
  const storeId = process.env.SSLCOMMERZ_STORE_ID?.trim();
  const storePassword = process.env.SSLCOMMERZ_STORE_PASSWORD;
  const verifySign = formValue(form, "verify_sign").toLowerCase();
  const verifyKey = formValue(form, "verify_key");
  if (!storeId || !storePassword) {
    throw new AuthenticationError("Payment provider signature verification is not configured.", 503);
  }
  if (!/^[a-f0-9]{32}$/.test(verifySign) || verifyKey.length < 1 || verifyKey.length > 2000) {
    throw new AuthenticationError("Payment provider signature is missing or malformed.", 400);
  }

  const keys = verifyKey.split(",").map((key) => key.trim());
  const requiredKeys = ["tran_id", "val_id", "amount", "currency", "status", "store_id"];
  if (
    keys.length === 0 ||
    keys.length > 80 ||
    new Set(keys).size !== keys.length ||
    keys.some((key) => !/^[A-Za-z0-9_]{1,64}$/.test(key)) ||
    requiredKeys.some((key) => !keys.includes(key))
  ) {
    throw new AuthenticationError("Payment provider signature fields are invalid.", 400);
  }

  const values: Record<string, string> = {};
  for (const key of keys) {
    const value = form.get(key);
    if (typeof value !== "string") {
      throw new AuthenticationError("A signed payment provider field is missing.", 400);
    }
    values[key] = value;
  }
  if (values.store_id !== storeId) {
    throw new AuthenticationError("Payment provider callback does not match this merchant.", 403);
  }

  if (!verifySslCommerzVerifySign(verifySign, keys, values, storePassword)) {
    throw new AuthenticationError("Payment provider signature verification failed.", 403);
  }
}

export async function readSslCommerzCallback(request: Request, requireSignature = false) {
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
  if (requireSignature) validateSslCommerzIpnHash(form);
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(validationId)) {
    return { transactionId, validationId: null };
  }
  return { transactionId, validationId };
}

export async function processSslCommerzCallback(request: Request) {
  const { transactionId, validationId } = await readSslCommerzCallback(request, true);
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
