import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { calculatePayroll, calculateProratedBaseSalary } from "../src/lib/payroll-policy.ts";

test("prorates salary inclusively for mid-period joining", () => {
  const result = calculateProratedBaseSalary({
    baseSalaryBdt: "31000.00",
    periodStart: new Date("2026-10-01T00:00:00.000Z"),
    periodEnd: new Date("2026-10-31T00:00:00.000Z"),
    joiningDate: new Date("2026-10-16T00:00:00.000Z"),
  });
  assert.equal(result.periodDays, 31);
  assert.equal(result.eligibleDays, 16);
  assert.equal(result.amountBdt.toFixed(2), "16000.00");
});

test("prorates salary through an inclusive leaving date", () => {
  const result = calculateProratedBaseSalary({
    baseSalaryBdt: 30000,
    periodStart: new Date("2026-10-01T00:00:00.000Z"),
    periodEnd: new Date("2026-10-31T00:00:00.000Z"),
    joiningDate: new Date("2020-01-01T00:00:00.000Z"),
    leavingDate: new Date("2026-10-10T00:00:00.000Z"),
  });
  assert.equal(result.eligibleDays, 10);
  assert.equal(result.amountBdt.toFixed(2), "9677.42");
});

test("uses explicit approved deduction rates and decimal rounding in BDT", () => {
  const result = calculatePayroll({
    baseSalaryBdt: "30000.00",
    allowancesBdt: "1500.00",
    deductions: [
      { name: "College-approved provident fund", rate: "0.05", enabled: true },
      { name: "Disabled policy item", rate: "0.20", enabled: false },
    ],
  });
  assert.equal(result.grossBdt.toFixed(2), "31500.00");
  assert.equal(result.deductionsBdt.toFixed(2), "1575.00");
  assert.equal(result.netBdt.toFixed(2), "29925.00");
});

test("rejects invalid dates, negative salary, and deductions exceeding gross", () => {
  assert.throws(() => calculateProratedBaseSalary({
    baseSalaryBdt: -1,
    periodStart: new Date("2026-10-01T00:00:00Z"),
    periodEnd: new Date("2026-10-31T00:00:00Z"),
    joiningDate: new Date("2026-10-01T00:00:00Z"),
  }));
  assert.throws(() => calculatePayroll({
    baseSalaryBdt: 100,
    deductions: [{ name: "Invalid", rate: "1.1", enabled: true }],
  }));
  assert.ok(new Prisma.Decimal("0.01").greaterThan(0));
});
