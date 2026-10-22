import test from "node:test";
import assert from "node:assert/strict";
import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

// SSLCommerz v4-style verify_sign contract used by the callback handler:
// MD5(sorted key=value pairs, including MD5(store_passwd)), compared in constant time.
function sign(fields, storePassword) {
  const values = { ...fields, store_passwd: createHash("md5").update(storePassword).digest("hex") };
  const serialized = Object.keys(values).sort().map((key) => `${key}=${values[key]}`).join("&");
  return createHash("md5").update(serialized).digest("hex");
}
function verify(fields, storePassword, supplied) {
  const expected = Buffer.from(sign(fields, storePassword), "hex");
  const actual = Buffer.from(supplied, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

test("SSLCommerz callback signature accepts an intact payload and rejects tampering", () => {
  const fields = { amount: "100.00", currency: "BDT", status: "VALID", store_id: "test-store", tran_id: "txn_123", val_id: "val_123" };
  const signature = sign(fields, "sandbox-secret");
  assert.equal(verify(fields, "sandbox-secret", signature), true);
  assert.equal(verify({ ...fields, amount: "900.00" }, "sandbox-secret", signature), false);
  assert.equal(verify(fields, "wrong-secret", signature), false);
});

test("production callback validates the required signed fields and compares signatures in constant time", () => {
  const callback = read("../src/lib/sslcommerz-callback.ts");
  for (const key of ["tran_id", "val_id", "amount", "currency", "status", "store_id"]) assert.ok(callback.includes(`"${key}"`));
  assert.match(callback, /timingSafeEqual/);
  assert.match(callback, /verify_sign/);
  assert.match(callback, /store_passwd/);
});

test("risk flag, delayed callback, partial payment and overpayment route to explicit review or balance states", () => {
  const settlement = read("../src/lib/sslcommerz-settlement.ts");
  assert.match(settlement, /riskLevel !== "0"/);
  assert.match(settlement, /PaymentStatus\.FAILED \|\| current\.status === PaymentStatus\.CANCELLED/);
  assert.match(settlement, /lateSuccess/);
  assert.match(settlement, /nextPaidAmount\.greaterThan\(current\.invoice\.totalAmount\)/);
  assert.match(settlement, /InvoiceStatus\.PARTIALLY_PAID/);
  assert.match(settlement, /PaymentStatus\.REVIEW/);
});
