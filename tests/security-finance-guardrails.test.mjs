import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("fee APIs scope student queries to the authenticated student and reject tampered IDs", () => {
  const fees = read("../src/app/api/fees/route.ts");
  assert.ok(fees.includes("requestedStudentId !== profile.userId"));
  assert.ok(fees.includes("prisma.studentProfile.findFirst"));
  assert.ok(fees.includes("requireSession"));
});

test("attendance and grade mutation routes must enforce a server-side role/session boundary", () => {
  const routes = [
    "../src/app/api/attendance/route.ts",
    "../src/app/api/grades/route.ts",
    "../src/app/api/exams/results/route.ts",
  ];
  for (const path of routes) {
    let source;
    try { source = read(path); } catch { continue; }
    assert.match(source, /requireSession|requireRole|authErrorResponse/, path + " must use shared authorization");
    assert.match(source, /institutionId|studentId|userId/, path + " must scope records to an authorized identity");
  }
});

test("payment settlement uses a serializable transaction, unique transaction identity, and BDT validation", () => {
  const settlement = read("../src/lib/sslcommerz-settlement.ts");
  assert.match(settlement, /Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(settlement, /tx\.payment\.create/);
  assert.match(settlement, /tx\.receipt\.create/);
  assert.match(settlement, /transaction\.currency !== "BDT" \|\| transaction\.invoice\.currency !== "BDT"/);
  assert.match(settlement, /updateMany\([\s\S]*?status: PaymentStatus\.PENDING/);
  assert.match(settlement, /nextPaidAmount\.greaterThan\(current\.invoice\.totalAmount\)/);
});

test("payroll rejects non-open periods and overlapping salary structures", () => {
  const payroll = read("../src/app/api/hr/payroll/route.ts");
  assert.match(payroll, /status: PayrollPeriodStatus\.OPEN/);
  assert.match(payroll, /overlappingSalary/);
  assert.match(payroll, /Prisma\.TransactionIsolationLevel\.Serializable/);
});
