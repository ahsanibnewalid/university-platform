import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("fee API scopes student reads and writes to the authenticated student profile", () => {
  const route = read("../src/app/api/fees/route.ts");
  assert.ok(route.includes("requestedStudentId !== profile.userId"));
  assert.ok(route.includes("prisma.studentProfile.findFirst"));
  assert.ok(route.includes("requireSession"));
});

test("academic enrollment endpoint prevents student IDOR and requires verified guardian links", () => {
  const route = read("../src/app/api/academic/enrollment/route.ts");
  assert.ok(route.includes("requestedStudentId !== profile.userId"));
  assert.ok(route.includes("verifiedAt: { not: null }"));
  assert.ok(route.includes("requireSession"));
});

test("settlement is transactional, idempotency-guarded, and uses BDT", () => {
  const settlement = read("../src/lib/sslcommerz-settlement.ts");
  assert.match(settlement, /Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(settlement, /tx\.payment\.create/);
  assert.match(settlement, /tx\.receipt\.create/);
  assert.match(settlement, /transaction\.currency !== "BDT" \|\| transaction\.invoice\.currency !== "BDT"/);
  assert.match(settlement, /status: PaymentStatus\.PENDING/);
  assert.match(settlement, /nextPaidAmount\.greaterThan\(current\.invoice\.totalAmount\)/);
});

test("payroll API rejects locked periods and detects overlapping salary structures", () => {
  const payroll = read("../src/app/api/hr/payroll/route.ts");
  assert.match(payroll, /status: PayrollPeriodStatus\.OPEN/);
  assert.match(payroll, /overlappingSalary/);
  assert.match(payroll, /Prisma\.TransactionIsolationLevel\.Serializable/);
});
