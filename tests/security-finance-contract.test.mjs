import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("fee, attendance, and academic endpoints enforce authenticated student scope", () => {
  const fees = read("../src/app/api/fees/route.ts");
  const attendance = read("../src/app/api/academic/attendance/route.ts");
  const enrollment = read("../src/app/api/academic/enrollment/route.ts");
  const registration = read("../src/app/api/academic/registration/route.ts");
  const registrationService = read("../src/lib/academic-registration.ts");
  assert.match(fees, /requestedStudentId !== profile\.userId/);
  assert.match(fees, /guardianLink\.findFirst/);
  assert.match(attendance, /requireSession/);
  assert.match(attendance, /studentId/);
  assert.match(enrollment, /requestedStudentId !== profile\.userId/);
  assert.match(enrollment, /guardianLink\.findFirst/);
});

test("payment settlement and cancellation use Prisma transactions and conditional state transitions", () => {
  const settlement = read("../src/lib/sslcommerz-settlement.ts");
  const callback = read("../src/lib/sslcommerz-callback.ts");
  assert.match(settlement, /prisma\.\$transaction\(async \(tx\)/);
  assert.match(settlement, /status: PaymentStatus\.PENDING/);
  assert.match(settlement, /PaymentStatus\.REVIEW/);
  assert.match(callback, /prisma\.\$transaction\(async \(tx\)/);
  assert.match(callback, /status === PaymentStatus\.PENDING/);
});

test("payroll locks periods conditionally and rejects overlapping active salary structures", () => {
  const payroll = read("../src/app/api/hr/payroll/route.ts");
  assert.match(payroll, /action === "lock-period"/);
  assert.match(payroll, /status: PayrollPeriodStatus\.OPEN/);
  assert.match(payroll, /overlapping active structure/);
  assert.match(payroll, /Prisma\.TransactionIsolationLevel\.Serializable/);
});
