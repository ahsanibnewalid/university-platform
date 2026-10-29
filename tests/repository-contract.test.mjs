import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("single-college provisioning is server-only and fixes Siddheswari College identity", () => {
  const setupApi = read("src/app/api/auth/bootstrap/route.ts");
  const login = read("src/app/login/page.tsx");
  const bootstrap = read("prisma/bootstrap-college.mjs");
  assert.ok(setupApi.includes("status: 404"));
  assert.ok(!setupApi.includes("prisma.institution.create"));
  assert.ok(!login.includes("Set up a new institution"));
  assert.ok(!login.includes("/api/auth/bootstrap"));
  assert.ok(bootstrap.includes('COLLEGE_NAME = "Siddheswari College"'));
  assert.ok(bootstrap.includes('COLLEGE_SLUG = "siddheswari-college"'));
  assert.ok(bootstrap.includes('tx.institution.count()'));
  assert.ok(bootstrap.includes('role: "SUPER_ADMIN"'));
  const singleCollegeMigration = read("prisma/migrations/20261029000000_enforce_single_college/migration.sql");
  assert.ok(singleCollegeMigration.includes('CHECK ("singletonKey" = 1)'));
});

test("existing-college first-admin recovery is server-only and refuses any prior administrator", () => {
  const initializer = read("prisma/initialize-existing-college-admin.mjs");
  const packageJson = JSON.parse(read("package.json"));
  assert.ok(packageJson.scripts["campus:admin-init"].includes("prisma/initialize-existing-college-admin.mjs"));
  assert.ok(initializer.includes('args[0] === "--check"'));
  assert.ok(initializer.includes('process.env.CAMPUS_CONFIRM_FIRST_ADMIN !== "Siddheswari College"'));
  assert.ok(initializer.includes('role: "SUPER_ADMIN"'));
  assert.ok(initializer.includes('action: { in: ["institution.initialized.from_server", "identity.first_super_admin.initialized"] }'));
  assert.ok(initializer.includes('tx.user.findUnique({ where: { email }'));
  assert.ok(initializer.includes('Prisma.TransactionIsolationLevel.Serializable'));
  assert.ok(initializer.includes('action: "identity.first_super_admin.initialized"'));
});

test("student-ID registration requires college role approval and staff signup cannot assign campus roles", () => {
  const schema = read("prisma/schema.prisma");
  const login = read("src/app/login/page.tsx");
  const auth = read("src/lib/password-login.ts");
  const staff = read("src/app/api/auth/staff-register/route.ts");
  const student = read("src/app/api/auth/student-register/route.ts");
  const registrar = read("src/app/api/admin/onboarding/route.ts");
  const roleApi = read("src/app/api/admin/roles/route.ts");
  const dashboard = read("src/app/dashboard/platform-dashboard.tsx");
  const invitation = read("src/app/api/invitations/route.ts");
  assert.ok(schema.includes("activationCodeHash"));
  assert.ok(schema.includes("StudentRegistrationStatus"));
  assert.ok(schema.includes("IdentityActivationPurpose"));
  assert.ok(login.includes('name="identifier"'));
  assert.ok(!login.includes('href="/accept-invitation"'));
  assert.ok(auth.includes("studentProfile.findUnique"));
  assert.ok(student.includes("StudentRegistrationStatus.PENDING"));
  assert.ok(!student.includes("activationCode:"));
  assert.ok(registrar.includes("requireSession(reviewRoles)"));
  assert.ok(registrar.includes("identityVerified"));
  assert.ok(registrar.includes("registration_approved"));
  assert.ok(roleApi.includes("requireSession(managers)"));
  assert.ok(roleApi.includes("target.role === CampusRole.SUPER_ADMIN"));
  assert.ok(dashboard.includes("Siddheswari <span>College</span>"));
  assert.ok(staff.includes("MembershipStatus.INVITED"));
  assert.ok(invitation.includes("status: 410"));
});

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
