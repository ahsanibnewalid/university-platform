import { InvoiceStatus, Prisma } from "@prisma/client";

export type PaymentReviewReason =
  | "RISKY_GATEWAY_TRANSACTION"
  | "CANCELLED_INVOICE"
  | "CHECKOUT_LOCK_MISMATCH"
  | "OVERPAYMENT";

export function assessPaymentSettlement(input: {
  riskLevel: unknown;
  invoiceStatus: InvoiceStatus;
  checkoutLock: string | null;
  transactionId: string;
  paidAmountBdt: Prisma.Decimal;
  paymentAmountBdt: Prisma.Decimal;
  invoiceTotalBdt: Prisma.Decimal;
}): { requiresReview: boolean; reasons: PaymentReviewReason[]; nextPaidAmountBdt: Prisma.Decimal } {
  const riskLevel = String(input.riskLevel ?? "0");
  const nextPaidAmountBdt = input.paidAmountBdt.add(input.paymentAmountBdt);
  const reasons: PaymentReviewReason[] = [];
  if (riskLevel !== "0") reasons.push("RISKY_GATEWAY_TRANSACTION");
  if (input.invoiceStatus === InvoiceStatus.CANCELLED) reasons.push("CANCELLED_INVOICE");
  if (input.checkoutLock !== input.transactionId) reasons.push("CHECKOUT_LOCK_MISMATCH");
  if (nextPaidAmountBdt.greaterThan(input.invoiceTotalBdt)) reasons.push("OVERPAYMENT");
  return { requiresReview: reasons.length > 0, reasons, nextPaidAmountBdt };
}

/** Payment amounts are exact BDT decimals, never binary floating-point calculations. */
export function validatePartialPaymentBdt(amount: Prisma.Decimal, outstanding: Prisma.Decimal): void {
  if (!amount.isFinite() || !outstanding.isFinite() || amount.lte(0) || outstanding.lt(0)) {
    throw new Error("Payment and outstanding invoice amounts must be valid BDT decimals.");
  }
  if (amount.greaterThan(outstanding)) {
    throw new Error("Payment exceeds the outstanding invoice balance; route it to finance review.");
  }
}
