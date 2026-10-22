import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("schema contains Siddheswari academic, payment-audit, and payroll domain models", () => {
  const schema = read("prisma/schema.prisma");
  for (const model of [
    "AcademicSession",
    "StudentAcademicEnrollment",
    "GradePoint",
    "TranscriptResult",
    "EmployeeProfile",
    "SalaryStructure",
    "PayrollPeriod",
    "PayrollRun",
    "PayrollAdjustment",
    "Payslip",
    "SSLCommerzLog",
  ]) {
    assert.ok(schema.includes(`model ${model} {`), `missing Prisma model ${model}`);
  }
  assert.ok(schema.includes('currency      String      @default("BDT")'));
  for (const type of ["HSC", "HONOURS", "DEGREE", "PROFESSIONAL_HONOURS", "MASTERS"]) {
    assert.ok(schema.includes(type), `missing program type ${type}`);
  }
});

test("fee API requires domain student profiles, prevents student IDOR, and fixes new fees to BDT", () => {
  const route = read("src/app/api/fees/route.ts");
  assert.ok(route.includes("prisma.studentProfile.findFirst"));
  assert.ok(route.includes("requestedStudentId !== profile.userId"));
  assert.ok(route.includes("requireSession(feeCreationRoles)"));
  assert.ok(route.includes('currency: "BDT"'));
  assert.ok(route.includes('input.currency !== "BDT"'));
});

test("SSLCommerz settlement validates BDT and commits settlement in a serializable transaction", () => {
  const route = read("src/lib/sslcommerz-settlement.ts");
  assert.ok(route.includes('transaction.currency !== "BDT" || transaction.invoice.currency !== "BDT"'));
  assert.ok(route.includes("prisma.$transaction"));
  assert.ok(route.includes("tx.payment.create"));
  assert.ok(route.includes("tx.sSLCommerzLog.create"));
  const callback = read("src/lib/sslcommerz-callback.ts");
  assert.ok(callback.includes("validateSslCommerzIpnHash"));
  assert.ok(callback.includes("timingSafeEqual"));
  assert.ok(callback.includes('readSslCommerzCallback(request, true)'));
});

test("payroll reads employee payslips by authenticated user and calculates within a serializable transaction", () => {
  const route = read("src/app/api/hr/payroll/route.ts");
  assert.ok(route.includes("where: { userId: session.userId, institutionId, active: true }"));
  assert.ok(route.includes("requireSession(payrollManagerRoles)"));
  assert.ok(route.includes("netSalary = grossSalary.sub(deductions)"));
  assert.ok(route.includes("Prisma.TransactionIsolationLevel.Serializable"));
  assert.ok(route.includes('currency: "BDT"'));
});
