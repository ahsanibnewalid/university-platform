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
    assert.match(schema, new RegExp(`model ${model}\\s*\\{`), `missing Prisma model ${model}`);
  }
  assert.match(schema, /model FeeRecord \\{[\\s\\S]*?currency\\s+String\\s+@default\\("BDT"\\)/);
  assert.match(schema, /enum ProgramType \\{[\\s\\S]*?HSC[\\s\\S]*?HONOURS[\\s\\S]*?DEGREE[\\s\\S]*?PROFESSIONAL_HONOURS[\\s\\S]*?MASTERS/);
});

test("fee API requires domain student profiles, prevents student IDOR, and fixes new fees to BDT", () => {
  const route = read("src/app/api/fees/route.ts");
  assert.match(route, /prisma\\.studentProfile\\.findFirst/);
  assert.match(route, /requestedStudentId !== profile\\.userId/);
  assert.match(route, /requireSession\\(feeCreationRoles\\)/);
  assert.match(route, /currency:\s*"BDT"/);
  assert.match(route, /input\\.currency !== "BDT"/);
});

test("SSLCommerz settlement validates BDT and commits settlement in a serializable transaction", () => {
  const route = read("src/lib/sslcommerz-settlement.ts");
  assert.match(route, /transaction\\.currency !== "BDT" \\|\\| transaction\\.invoice\\.currency !== "BDT"/);
  assert.match(route, /prisma\\.\\$transaction/);
  assert.match(route, /tx\\.payment\\.create/);
  assert.match(route, /tx\\.sslCommerzLog\\.create/);
});

test("payroll reads employee payslips by authenticated user and calculates within a serializable transaction", () => {
  const route = read("src/app/api/hr/payroll/route.ts");
  assert.match(route, /where:\s*\\{ userId: session\\.userId, institutionId, active: true \\}/);
  assert.match(route, /requireSession\\(payrollManagerRoles\\)/);
  assert.match(route, /netSalary = grossSalary\\.sub\\(deductions\\)/);
  assert.match(route, /Prisma\\.TransactionIsolationLevel\\.Serializable/);
  assert.match(route, /currency:\s*"BDT"/);
});
