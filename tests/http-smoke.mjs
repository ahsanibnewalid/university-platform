import assert from "node:assert/strict";
import { createHash, randomBytes, scryptSync } from "node:crypto";

const origin = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";

async function request(path, expectedStatus) {
  const response = await fetch(new URL(path, origin), { redirect: "manual" });
  assert.equal(response.status, expectedStatus, `${path} returned HTTP ${response.status}`);
}

async function waitUntilReady() {
  for (let attempt = 0; attempt < 45; attempt++) {
    try {
      const response = await fetch(origin, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // The server can take a few seconds to bind its port.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Server at ${origin} did not become ready`);
}

await waitUntilReady();
await request("/", 200);
await request("/login", 200);
await request("/register/student", 200);
await request("/register/staff", 200);
await request("/academics", 200);
await request("/notices", 200);
await request("/api/health", 200);
await request("/api/dashboard", 401);
await request("/api/announcements", 401);
await request("/api/guardians", 401);
await request("/api/admin/audit-events", 401);
await request("/api/auth/bootstrap", 404);

// Explicit opt-in. Never bootstrap or seed a real college database from a smoke test.
if (process.env.SMOKE_AUTHENTICATED === "1") {
  const url = new URL(origin);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname), "Authenticated smoke tests require a local test server");
  assert.ok(process.env.CAMPUS_ADMIN_EMAIL, "Test-only administrator email is required");
  assert.ok(process.env.CAMPUS_ADMIN_PASSWORD?.length >= 12, "Test-only administrator password is required");
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const unique = randomBytes(5).toString("hex");
  const emailFor = (role) => `smoke-${role.toLowerCase()}-${unique}@example.invalid`;
  const password = process.env.CAMPUS_ADMIN_PASSWORD;
  const salt = randomBytes(16).toString("hex");
  const hash = `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;

  async function api(path, { token, method = "GET", body, status = 200 } = {}) {
    const response = await fetch(new URL(path, origin), {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json", Origin: origin } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json().catch(() => ({}));
    assert.equal(response.status, status, `${method} ${path}: ${response.status} ${JSON.stringify(data)}`);
    return data;
  }
  const signin = async (email) => {
    const body = await api("/api/mobile/auth/login", { method: "POST", body: { identifier: email, password } });
    assert.ok(typeof body.token === "string" && body.token.length >= 40);
    return body.token;
  };

  try {
    await api("/api/auth/bootstrap", { method: "POST", status: 404, body: { institutionName: "Untrusted University" } });
    const adminToken = await signin(process.env.CAMPUS_ADMIN_EMAIL);
    const current = await api("/api/auth/session", { token: adminToken });
    assert.equal(current.role, "SUPER_ADMIN");
    assert.equal(current.institution.name, "Siddheswari College");
    await assert.rejects(prisma.institution.create({ data: {
      singletonKey: 2, name: "Unapproved second college", slug: `extra-${unique}`,
    } }), "PostgreSQL must refuse a second institution even when a different singleton key is supplied");
    await api("/api/dashboard", { token: adminToken });

    const createUser = async (role, name) => {
      const user = await prisma.user.create({ data: { email: emailFor(role), name, passwordHash: hash, emailVerified: new Date() } });
      await prisma.membership.create({ data: { userId: user.id, institutionId: current.institution.id, role, status: "ACTIVE" } });
      return user;
    };
    const teacher = await createUser("TEACHER", "CI Teacher");
    await createUser("EXAM_CONTROLLER", "CI Exam Controller");
    const student = await createUser("STUDENT", "CI Student");
    const department = await prisma.department.create({ data: { institutionId: current.institution.id, code: "CSE", name: "Computer Science" } });
    const program = await prisma.program.create({ data: { departmentId: department.id, code: "HSC-CI", name: "CI HSC", level: "HSC", programType: "HSC" } });
    await prisma.studentProfile.create({ data: { userId: student.id, studentNumber: `SMOKE-${unique}`, programId: program.id } });
    // A student cannot self-assign a record or staff role. The college issues
    // the ID and a one-time code, after which students choose their password.
    await api("/api/invitations", { token: adminToken, method: "POST", status: 410, body: {} });
    await api("/api/admin/onboarding", { method: "POST", status: 401,
      body: { kind: "staff", name: "Fake principal", email: "fake@gmail.com", role: "PRINCIPAL" } });
    const issued = await api("/api/admin/onboarding", { token: adminToken, method: "POST", status: 201,
      body: { kind: "student", name: "College Approved Student", studentNumber: `ACTIVATE-${unique}`, programId: program.id } });
    assert.ok(issued.activationCode?.length >= 20);
    await api("/api/auth/student-register", { method: "POST", status: 400,
      body: { studentNumber: `ACTIVATE-${unique}`, activationCode: "wrong-code-123456789012", password } });
    await api("/api/auth/student-register", { method: "POST",
      body: { studentNumber: `ACTIVATE-${unique}`, activationCode: issued.activationCode, password } });
    const activatedToken = await signin(`ACTIVATE-${unique}`);
    const activatedSession = await api("/api/auth/session", { token: activatedToken });
    assert.equal(activatedSession.role, "STUDENT");
    assert.equal(activatedSession.user.email, null);
    const studentGmail = `ci-student-${unique}@gmail.com`;
    const studentGmailToken = randomBytes(32).toString("base64url");
    await prisma.identityActivation.create({ data: { userId: activatedSession.user.id,
      email: studentGmail, purpose: "STUDENT_EMAIL",
      tokenHash: createHash("sha256").update(studentGmailToken).digest("hex"),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000) } });
    await api("/api/auth/student-email", { token: activatedToken, method: "PUT",
      body: { token: studentGmailToken } });
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: activatedSession.user.id } })).email, studentGmail);
    await api("/api/mobile/auth/login", { method: "POST", status: 401,
      body: { identifier: studentGmail, password } });
    const staffEmail = `ci-college-${unique}@gmail.com`;
    await api("/api/admin/onboarding", { token: adminToken, method: "POST", status: 201,
      body: { kind: "staff", name: "Approved Gmail Teacher", email: staffEmail, role: "TEACHER" } });
    const authorizedStaff = await prisma.user.findUniqueOrThrow({ where: { email: staffEmail } });
    const emailToken = randomBytes(32).toString("base64url");
    await prisma.identityActivation.create({ data: { userId: authorizedStaff.id,
      email: staffEmail, purpose: "STAFF_SIGNUP",
      tokenHash: createHash("sha256").update(emailToken).digest("hex"),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000) } });
    await api("/api/auth/staff-register", { method: "PUT",
      body: { token: emailToken, password } });
    const approvedStaffToken = await signin(staffEmail);
    assert.equal((await api("/api/auth/session", { token: approvedStaffToken })).role, "TEACHER");
    const term = await prisma.academicTerm.create({ data: {
      institutionId: current.institution.id, name: `CI term ${unique}`,
      startsAt: new Date("2026-09-01T00:00:00Z"), endsAt: new Date("2027-03-01T00:00:00Z"), status: "ACTIVE",
    } });
    const course = await prisma.course.create({ data: { departmentId: department.id, code: `CI-${unique}`, title: "CI Exam Test", credits: 3 } });
    const section = await prisma.courseSection.create({ data: { courseId: course.id, termId: term.id, sectionCode: "A" } });
    await prisma.courseInstructor.create({ data: { sectionId: section.id, userId: teacher.id } });
    await prisma.enrollment.create({ data: { sectionId: section.id, studentId: student.id } });
    const exam = await prisma.exam.create({ data: { sectionId: section.id, title: "CI Internal Exam", startsAt: new Date("2026-11-01T10:00:00Z"), maxPoints: 100 } });

    const teacherToken = await signin(emailFor("TEACHER"));
    const reviewerToken = await signin(emailFor("EXAM_CONTROLLER"));
    const studentToken = await signin(`SMOKE-${unique}`);
    await api("/api/admin/audit-events", { token: teacherToken, status: 403 });
    await api("/api/exams", { token: teacherToken, method: "PATCH", status: 400,
      body: { examId: exam.id, studentId: student.id, points: 89, release: true } });
    await api("/api/exams", { token: teacherToken, method: "PATCH",
      body: { examId: exam.id, studentId: student.id, points: 89 } });
    await api("/api/exams/moderation", { token: teacherToken, method: "POST",
      body: { examId: exam.id, action: "SUBMIT" } });
    await api("/api/exams/moderation", { token: teacherToken, method: "POST", status: 403,
      body: { examId: exam.id, action: "APPROVE" } });
    await api("/api/exams/moderation", { token: reviewerToken, method: "POST",
      body: { examId: exam.id, action: "APPROVE" } });
    await api("/api/exams/moderation", { token: reviewerToken, method: "POST",
      body: { examId: exam.id, action: "PUBLISH" } });
    const released = await api("/api/exams", { token: studentToken });
    assert.equal(released.exams.find((entry) => entry.id === exam.id)?.results[0]?.points, "89");
    await api("/api/exams", { token: teacherToken, method: "PATCH", status: 409,
      body: { examId: exam.id, studentId: student.id, points: 50 } });
    const audit = await api("/api/admin/audit-events", { token: adminToken });
    assert.ok(audit.events.some((entry) => entry.action === "academic.exam.moderation.publish"));
    assert.ok(audit.events.every((entry) => !("metadata" in entry)));
    await api("/api/mobile/auth/logout", { token: teacherToken, method: "POST", body: {} });
    await api("/api/dashboard", { token: teacherToken, status: 401 });
    process.stdout.write("Authenticated mobile and exam-moderation smoke checks passed.\n");
  } finally {
    await prisma.$disconnect();
  }
}

process.stdout.write("Public pages and unauthenticated access smoke checks passed.\n");
