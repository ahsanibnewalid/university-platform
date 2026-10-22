import test from "node:test";
import assert from "node:assert/strict";
import { InvoiceStatus, Prisma } from "@prisma/client";
import { assessPaymentSettlement, validatePartialPaymentBdt } from "../src/lib/payment-policy.ts";
import { createSslCommerzVerifySign, verifySslCommerzVerifySign } from "../src/lib/sslcommerz-signature.ts";

const decimal = (value: string) => new Prisma.Decimal(value);
const fields = ["tran_id", "val_id", "amount", "currency", "status", "store_id"];
const values = {
  tran_id: "SC_TEST_001",
  val_id: "VAL_001",
  amount: "100.00",
  currency: "BDT",
  status: "VALID",
  store_id: "sandbox-store",
};

test("validates SSLCommerz v4 verify_sign and rejects tampered signed fields", () => {
  const signature = createSslCommerzVerifySign(fields, values, "sandbox-password");
  assert.equal(verifySslCommerzVerifySign(signature, fields, values, "sandbox-password"), true);
  assert.equal(verifySslCommerzVerifySign(signature, fields, { ...values, amount: "101.00" }, "sandbox-password"), false);
  assert.equal(verifySslCommerzVerifySign(signature, fields, values, "wrong-password"), false);
  assert.equal(verifySslCommerzVerifySign("not-a-hash", fields, values, "sandbox-password"), false);
});

test("safe risk flag can settle only when invoice lock and balance are consistent", () => {
  const result = assessPaymentSettlement({
    riskLevel: "0",
    invoiceStatus: InvoiceStatus.OPEN,
    checkoutLock: "SC_TEST_001",
    transactionId: "SC_TEST_001",
    paidAmountBdt: decimal("0.00"),
    paymentAmountBdt: decimal("100.00"),
    invoiceTotalBdt: decimal("250.00"),
  });
  assert.equal(result.requiresReview, false);
  assert.equal(result.nextPaidAmountBdt.toFixed(2), "100.00");
});

test("risk flag 1 is held for finance review, not automatically applied", () => {
  const result = assessPaymentSettlement({
    riskLevel: "1",
    invoiceStatus: InvoiceStatus.OPEN,
    checkoutLock: "SC_TEST_001",
    transactionId: "SC_TEST_001",
    paidAmountBdt: decimal("0.00"),
    paymentAmountBdt: decimal("100.00"),
    invoiceTotalBdt: decimal("250.00"),
  });
  assert.equal(result.requiresReview, true);
  assert.ok(result.reasons.includes("RISKY_GATEWAY_TRANSACTION"));
});

test("allows partial BDT payments but rejects overpayment", () => {
  assert.doesNotThrow(() => validatePartialPaymentBdt(decimal("60.00"), decimal("100.00")));
  assert.throws(() => validatePartialPaymentBdt(decimal("100.01"), decimal("100.00")), /exceeds/);
});

test("overpayment and cancelled invoices require review", () => {
  const overpaid = assessPaymentSettlement({
    riskLevel: "0",
    invoiceStatus: InvoiceStatus.OPEN,
    checkoutLock: "SC_TEST_001",
    transactionId: "SC_TEST_001",
    paidAmountBdt: decimal("90.00"),
    paymentAmountBdt: decimal("20.00"),
    invoiceTotalBdt: decimal("100.00"),
  });
  assert.ok(overpaid.reasons.includes("OVERPAYMENT"));

  const cancelled = assessPaymentSettlement({
    riskLevel: "0",
    invoiceStatus: InvoiceStatus.CANCELLED,
    checkoutLock: null,
    transactionId: "SC_TEST_001",
    paidAmountBdt: decimal("0.00"),
    paymentAmountBdt: decimal("20.00"),
    invoiceTotalBdt: decimal("100.00"),
  });
  assert.ok(cancelled.reasons.includes("CANCELLED_INVOICE"));
  assert.ok(cancelled.reasons.includes("CHECKOUT_LOCK_MISMATCH"));
});
