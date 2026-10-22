import {
  CampusRole,
  MembershipStatus,
  PayrollAdjustmentType,
  PayrollPeriodStatus,
  PayrollRunStatus,
  Prisma,
  PayslipStatus,
} from "@prisma/client";
import {
  AuthenticationError,
  authErrorResponse,
  assertSameOrigin,
  requireSession,
} from "@/lib/auth";
import { readJsonObject, requiredText, validDate } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { calculateProratedBaseSalary } from "@/lib/payroll-policy";

const payrollManagerRoles: CampusRole[] = [
  CampusRole.SUPER_ADMIN,
  CampusRole.UNIVERSITY_ADMIN,
  CampusRole.PRINCIPAL,
  CampusRole.REGISTRAR,
  CampusRole.FINANCE_ADMIN,
  CampusRole.ACCOUNTANT,
  CampusRole.HR,
];

function validMoney(value: unknown, label: string, allowZero = false) {
  if (typeof value !== "number" || !Number.isFinite(value) || value > 100000000 || value < (allowZero ? 0 : 0.01)) {
    throw new AuthenticationError(`${label} must be a valid BDT amount.`, 400);
  }
  const amount = new Prisma.Decimal(value);
  if (amount.decimalPlaces() > 2) {
    throw new AuthenticationError(`${label} can have at most two decimal places.`, 400);
  }
  return amount;
}

function isAdjustmentType(value: unknown): value is PayrollAdjustmentType {
  return typeof value === "string" &&
    Object.values(PayrollAdjustmentType).includes(value as PayrollAdjustmentType);
}

export async function GET() {
  try {
    const session = await requireSession();
    const institutionId = session.membership.institutionId;

    if (payrollManagerRoles.includes(session.membership.role)) {
      const [periods, employees] = await Promise.all([
        prisma.payrollPeriod.findMany({
          where: { institutionId },
          include: {
            runs: {
              include: { _count: { select: { payslips: true } } },
              orderBy: { runNumber: "desc" },
            },
          },
          orderBy: { startsAt: "desc" },
          take: 60,
        }),
        prisma.employeeProfile.findMany({
          where: { institutionId },
          include: {
            user: { select: { id: true, name: true, email: true } },
            salaryStructures: {
              where: { active: true, currency: "BDT" },
              orderBy: { effectiveFrom: "desc" },
              take: 1,
            },
          },
          orderBy: [{ active: "desc" }, { employeeNumber: "asc" }],
          take: 1000,
        }),
      ]);
      return Response.json({
        periods,
        employees: employees.map((employee) => ({
          id: employee.id,
          employeeNumber: employee.employeeNumber,
          jobTitle: employee.jobTitle,
          active: employee.active,
          user: employee.user,
          currentSalaryStructure: employee.salaryStructures[0] ?? null,
        })),
      });
    }

    const employee = await prisma.employeeProfile.findFirst({
      where: { userId: session.userId, institutionId, active: true },
      select: { id: true },
    });
    if (!employee) throw new AuthenticationError("An active employee profile is required to view payslips.", 403);
    const payslips = await prisma.payslip.findMany({
      where: { employeeProfileId: employee.id },
      include: {
        payrollRun: {
          select: {
            runNumber: true,
            period: { select: { name: true, startsAt: true, endsAt: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 60,
    });
    return Response.json({ payslips });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(payrollManagerRoles);
    const input = await readJsonObject(request);
    const action = requiredText(input.action, "Action", 2, 40);
    const institutionId = session.membership.institutionId;

    if (action === "create-period") {
      const name = requiredText(input.name, "Payroll period name", 3, 80);
      const startsAt = validDate(input.startsAt, "Period start date");
      const endsAt = validDate(input.endsAt, "Period end date");
      if (endsAt < startsAt) throw new AuthenticationError("Period end date must be on or after the start date.", 400);

      const period = await prisma.$transaction(async (tx) => {
        const created = await tx.payrollPeriod.create({
          data: { institutionId, name, startsAt, endsAt },
        });
        await tx.auditEvent.create({
          data: {
            institutionId,
            actorId: session.userId,
            action: "hr.payroll.period_created",
            entityType: "PayrollPeriod",
            entityId: created.id,
            metadata: { name, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() },
          },
        });
        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return Response.json({ period }, { status: 201 });
    }

    if (action === "create-employee") {
      const userId = requiredText(input.userId, "Employee account", 1, 100);
      const employeeNumber = requiredText(input.employeeNumber, "Employee number", 2, 40);
      const jobTitle = requiredText(input.jobTitle, "Job title", 2, 100);
      const departmentId = input.departmentId === undefined || input.departmentId === null || input.departmentId === ""
        ? null
        : requiredText(input.departmentId, "Department", 1, 100);

      const [membership, staffProfile, teacherProfile, department] = await Promise.all([
        prisma.membership.findFirst({
          where: {
            userId,
            institutionId,
            status: MembershipStatus.ACTIVE,
            role: {
              in: [
                CampusRole.STAFF,
                CampusRole.OFFICE_STAFF,
                CampusRole.TEACHER,
                CampusRole.FACULTY,
                CampusRole.PRINCIPAL,
                CampusRole.REGISTRAR,
                CampusRole.HR,
                CampusRole.ACCOUNTANT,
              ],
            },
          },
          select: { userId: true },
        }),
        prisma.staffProfile.findUnique({ where: { userId }, select: { userId: true } }),
        prisma.teacherProfile.findUnique({ where: { userId }, select: { userId: true } }),
        departmentId
          ? prisma.department.findFirst({
              where: { id: departmentId, institutionId },
              select: { id: true },
            })
          : Promise.resolve(null),
      ]);
      if (!membership || (!staffProfile && !teacherProfile)) {
        throw new AuthenticationError("Employee must have an active staff or teacher profile at this college.", 400);
      }
      if (departmentId && !department) throw new AuthenticationError("Department not found for this college.", 404);

      const employee = await prisma.$transaction(async (tx) => {
        const created = await tx.employeeProfile.create({
          data: { institutionId, userId, employeeNumber, jobTitle, departmentId },
        });
        await tx.auditEvent.create({
          data: {
            institutionId,
            actorId: session.userId,
            action: "hr.employee_profile.created",
            entityType: "EmployeeProfile",
            entityId: created.id,
            metadata: { employeeNumber, jobTitle, departmentId },
          },
        });
        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return Response.json({ employee }, { status: 201 });
    }

    if (action === "set-salary") {
      const employeeProfileId = requiredText(input.employeeProfileId, "Employee", 1, 100);
      if (input.currency !== undefined && input.currency !== "BDT") {
        throw new AuthenticationError("Salary structures must use BDT.", 400);
      }
      const baseSalary = validMoney(input.baseSalary, "Base salary");
      const effectiveFrom = validDate(input.effectiveFrom, "Salary effective date");
      const effectiveUntil = input.effectiveUntil === undefined || input.effectiveUntil === null || input.effectiveUntil === ""
        ? null
        : validDate(input.effectiveUntil, "Salary end date");
      if (effectiveUntil && effectiveUntil < effectiveFrom) {
        throw new AuthenticationError("Salary end date must not precede the effective date.", 400);
      }
      const employee = await prisma.employeeProfile.findFirst({
        where: { id: employeeProfileId, institutionId, active: true },
        select: { id: true },
      });
      if (!employee) throw new AuthenticationError("Active employee not found.", 404);

      const salaryStructure = await prisma.$transaction(async (tx) => {
        const overlapping = await tx.salaryStructure.findFirst({
          where: {
            institutionId,
            employeeProfileId: employee.id,
            active: true,
            effectiveFrom: { lte: effectiveUntil ?? new Date("9999-12-31T23:59:59.999Z") },
            OR: [
              { effectiveUntil: null },
              { effectiveUntil: { gte: effectiveFrom } },
            ],
          },
          select: { id: true, effectiveFrom: true, effectiveUntil: true },
        });
        if (overlapping) {
          throw new AuthenticationError(
            "Salary structure dates overlap an existing active structure; close the previous structure before adding another.",
            409,
          );
        }
        const created = await tx.salaryStructure.create({
          data: {
            institutionId,
            employeeProfileId: employee.id,
            baseSalary,
            currency: "BDT",
            effectiveFrom,
            effectiveUntil,
          },
        });
        await tx.auditEvent.create({
          data: {
            institutionId,
            actorId: session.userId,
            action: "hr.salary_structure.created",
            entityType: "SalaryStructure",
            entityId: created.id,
            metadata: { employeeProfileId, baseSalary: baseSalary.toFixed(2), currency: "BDT" },
          },
        });
        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return Response.json({ salaryStructure }, { status: 201 });
    }

    if (action === "add-adjustment") {
      const employeeProfileId = requiredText(input.employeeProfileId, "Employee", 1, 100);
      const periodId = requiredText(input.periodId, "Payroll period", 1, 100);
      const reason = requiredText(input.reason, "Adjustment reason", 3, 250);
      const amount = validMoney(input.amount, "Adjustment amount");
      if (!isAdjustmentType(input.type)) throw new AuthenticationError("Adjustment type must be ALLOWANCE or DEDUCTION.", 400);

      const [employee, period] = await Promise.all([
        prisma.employeeProfile.findFirst({
          where: { id: employeeProfileId, institutionId, active: true },
          select: { id: true },
        }),
        prisma.payrollPeriod.findFirst({
          where: { id: periodId, institutionId, status: PayrollPeriodStatus.OPEN },
          select: { id: true },
        }),
      ]);
      if (!employee) throw new AuthenticationError("Active employee not found.", 404);
      if (!period) throw new AuthenticationError("Open payroll period not found.", 404);

      const adjustment = await prisma.$transaction(async (tx) => {
        const created = await tx.payrollAdjustment.create({
          data: { employeeProfileId: employee.id, periodId: period.id, createdById: session.userId, type: input.type as PayrollAdjustmentType, amount, reason },
        });
        await tx.auditEvent.create({
          data: {
            institutionId,
            actorId: session.userId,
            action: "hr.payroll.adjustment_created",
            entityType: "PayrollAdjustment",
            entityId: created.id,
            metadata: { employeeProfileId, periodId, type: created.type, amount: amount.toFixed(2), reason },
          },
        });
        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return Response.json({ adjustment }, { status: 201 });
    }

    if (action === "create-run") {
      const periodId = requiredText(input.periodId, "Payroll period", 1, 100);
      const run = await prisma.$transaction(async (tx) => {
        const period = await tx.payrollPeriod.findFirst({
          where: { id: periodId, institutionId, status: PayrollPeriodStatus.OPEN },
          select: { id: true },
        });
        if (!period) throw new AuthenticationError("Open payroll period not found.", 404);
        const latestRun = await tx.payrollRun.findFirst({
          where: { periodId: period.id },
          orderBy: { runNumber: "desc" },
          select: { runNumber: true },
        });
        const created = await tx.payrollRun.create({
          data: {
            institutionId,
            periodId: period.id,
            runNumber: (latestRun?.runNumber ?? 0) + 1,
            createdById: session.userId,
          },
        });
        await tx.auditEvent.create({
          data: {
            institutionId,
            actorId: session.userId,
            action: "hr.payroll.run_created",
            entityType: "PayrollRun",
            entityId: created.id,
            metadata: { periodId, runNumber: created.runNumber },
          },
        });
        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return Response.json({ run }, { status: 201 });
    }

    if (action === "calculate-run") {
      const runId = requiredText(input.runId, "Payroll run", 1, 100);
      const result = await prisma.$transaction(async (tx) => {
        const run = await tx.payrollRun.findFirst({
          where: { id: runId, institutionId },
          include: { period: true },
        });
        if (!run) throw new AuthenticationError("Payroll run not found.", 404);
        if (run.status !== PayrollRunStatus.DRAFT || run.period.status !== PayrollPeriodStatus.OPEN) {
          throw new AuthenticationError("Only a draft run in an open period can be calculated.", 409);
        }

        const employees = await tx.employeeProfile.findMany({
          where: {
            institutionId,
            active: true,
            OR: [{ hiredAt: null }, { hiredAt: { lte: run.period.endsAt } }],
          },
          include: {
            salaryStructures: {
              where: {
                active: true,
                currency: "BDT",
                effectiveFrom: { lte: run.period.endsAt },
                OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: run.period.startsAt } }],
              },
              orderBy: { effectiveFrom: "desc" },
            },
          },
          orderBy: { employeeNumber: "asc" },
        });
        if (employees.length === 0) throw new AuthenticationError("No active employees are configured for payroll.", 400);
        const missingSalary = employees.filter((employee) => employee.salaryStructures.length === 0);
        const overlappingSalary = employees.filter((employee) => employee.salaryStructures.length > 1);
        const invalidSalaryCoverage = employees.filter((employee) => {
          const salary = employee.salaryStructures[0];
          const joinedMidPeriod = employee.hiredAt !== null &&
            employee.hiredAt > run.period.startsAt &&
            employee.hiredAt <= run.period.endsAt;
          if (!salary) return true;
          if (!joinedMidPeriod && salary.effectiveFrom > run.period.startsAt) return true;
          if (salary.effectiveUntil && salary.effectiveUntil < run.period.endsAt) return true;
          return false;
        });
        if (missingSalary.length || overlappingSalary.length || invalidSalaryCoverage.length) {
          throw new AuthenticationError(
            `Payroll blocked: ${missingSalary.length} employee(s) lack an applicable BDT salary structure, ${overlappingSalary.length} employee(s) have overlapping salary structures, and ${invalidSalaryCoverage.length} employee(s) have incomplete salary coverage. Review dates and approved policies before retrying.`,
            409,
          );
        }

        const adjustments = await tx.payrollAdjustment.findMany({
          where: {
            periodId: run.periodId,
            employeeProfileId: { in: employees.map((employee) => employee.id) },
          },
          orderBy: { createdAt: "asc" },
        });

        let totalGross = new Prisma.Decimal(0);
        let totalDeductions = new Prisma.Decimal(0);
        let totalNet = new Prisma.Decimal(0);
        for (const employee of employees) {
          const salary = employee.salaryStructures[0];
          if (!salary || salary.currency !== "BDT") {
            throw new AuthenticationError("Payroll requires an effective BDT salary structure for every employee.", 409);
          }
          const employeeAdjustments = adjustments.filter((adjustment) => adjustment.employeeProfileId === employee.id);
          const allowances = employeeAdjustments
            .filter((adjustment) => adjustment.type === PayrollAdjustmentType.ALLOWANCE)
            .reduce((total, adjustment) => total.add(adjustment.amount), new Prisma.Decimal(0));
          const deductions = employeeAdjustments
            .filter((adjustment) => adjustment.type === PayrollAdjustmentType.DEDUCTION)
            .reduce((total, adjustment) => total.add(adjustment.amount), new Prisma.Decimal(0));
          const joinedMidPeriod = employee.hiredAt !== null &&
            employee.hiredAt > run.period.startsAt &&
            employee.hiredAt <= run.period.endsAt;
          const baseSalaryForPeriod = joinedMidPeriod
            ? calculateProratedBaseSalary({
                baseSalaryBdt: salary.baseSalary,
                periodStart: run.period.startsAt,
                periodEnd: run.period.endsAt,
                joiningDate: new Date(Math.max(employee.hiredAt!.getTime(), salary.effectiveFrom.getTime())),
              }).amountBdt
            : salary.baseSalary;
          const grossSalary = baseSalaryForPeriod.add(allowances);
          const netSalary = grossSalary.sub(deductions);
          if (netSalary.lessThan(0)) {
            throw new AuthenticationError(`Payroll blocked: deductions exceed gross pay for employee ${employee.employeeNumber}.`, 409);
          }
          await tx.payslip.create({
            data: {
              payrollRunId: run.id,
              employeeProfileId: employee.id,
              salaryStructureId: salary.id,
              grossSalary,
              allowances,
              deductions,
              netSalary,
              currency: "BDT",
              status: PayslipStatus.GENERATED,
              breakdown: {
                contractBaseSalary: salary.baseSalary.toFixed(2),
                baseSalary: baseSalaryForPeriod.toFixed(2),
                prorationApplied: joinedMidPeriod,
                allowances: allowances.toFixed(2),
                deductions: deductions.toFixed(2),
                adjustmentItems: employeeAdjustments.map((adjustment) => ({
                  type: adjustment.type,
                  amount: adjustment.amount.toFixed(2),
                  reason: adjustment.reason,
                })),
              },
            },
          });
          totalGross = totalGross.add(grossSalary);
          totalDeductions = totalDeductions.add(deductions);
          totalNet = totalNet.add(netSalary);
        }

        const updatedRun = await tx.payrollRun.update({
          where: { id: run.id },
          data: {
            status: PayrollRunStatus.CALCULATED,
            totalGross,
            totalDeductions,
            totalNet,
          },
        });
        await tx.auditEvent.create({
          data: {
            institutionId,
            actorId: session.userId,
            action: "hr.payroll.run_calculated",
            entityType: "PayrollRun",
            entityId: run.id,
            metadata: {
              employeeCount: employees.length,
              totalGross: totalGross.toFixed(2),
              totalDeductions: totalDeductions.toFixed(2),
              totalNet: totalNet.toFixed(2),
              currency: "BDT",
            },
          },
        });
        return updatedRun;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return Response.json({ run: result });
    }

    if (action === "lock-period") {
      const periodId = requiredText(input.periodId, "Payroll period", 1, 100);
      const result = await prisma.$transaction(async (tx) => {
        const period = await tx.payrollPeriod.findFirst({
          where: { id: periodId, institutionId, status: PayrollPeriodStatus.OPEN },
          select: { id: true, name: true },
        });
        if (!period) throw new AuthenticationError("Open payroll period not found.", 404);
        const runs = await tx.payrollRun.findMany({
          where: { periodId: period.id },
          select: { id: true, status: true },
        });
        if (runs.length === 0 || runs.some((run) => run.status !== PayrollRunStatus.CALCULATED)) {
          throw new AuthenticationError("Every payroll run must be calculated before the period can be locked.", 409);
        }
        const lockedAt = new Date();
        await tx.payrollRun.updateMany({
          where: { periodId: period.id, status: PayrollRunStatus.CALCULATED },
          data: { status: PayrollRunStatus.LOCKED, lockedAt },
        });
        const lockedPeriod = await tx.payrollPeriod.update({
          where: { id: period.id },
          data: { status: PayrollPeriodStatus.LOCKED, lockedAt },
        });
        await tx.auditEvent.create({
          data: {
            institutionId,
            actorId: session.userId,
            action: "hr.payroll.period_locked",
            entityType: "PayrollPeriod",
            entityId: period.id,
            metadata: { periodName: period.name, runCount: runs.length, lockedAt: lockedAt.toISOString() },
          },
        });
        return lockedPeriod;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return Response.json({ period: result });
    }

    throw new AuthenticationError("Unsupported payroll action.", 400);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ error: "A payroll record with a duplicate employee, period, or number already exists." }, { status: 409 });
    }
    return authErrorResponse(error);
  }
}
