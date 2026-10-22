import { Prisma } from "@prisma/client";

export type ProrationInput = {
  baseSalaryBdt: Prisma.Decimal | string | number;
  periodStart: Date;
  periodEnd: Date;
  joiningDate: Date;
  leavingDate?: Date | null;
};

export type DeductionRule = {
  name: string;
  rate: Prisma.Decimal | string | number;
  taxableBaseBdt?: Prisma.Decimal | string | number;
  enabled: boolean;
};

export type PayrollCalculation = {
  currency: "BDT";
  eligibleDays: number;
  periodDays: number;
  grossBdt: Prisma.Decimal;
  deductionsBdt: Prisma.Decimal;
  netBdt: Prisma.Decimal;
  deductions: Array<{ name: string; amountBdt: Prisma.Decimal }>;
};

const decimal = (value: Prisma.Decimal | string | number) => new Prisma.Decimal(value);
const roundMoney = (value: Prisma.Decimal) => value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export function calculateProratedBaseSalary(input: ProrationInput): {
  amountBdt: Prisma.Decimal;
  eligibleDays: number;
  periodDays: number;
} {
  const { periodStart, periodEnd, joiningDate, leavingDate } = input;
  for (const date of [periodStart, periodEnd, joiningDate, ...(leavingDate ? [leavingDate] : [])]) {
    if (!Number.isFinite(date.getTime())) throw new Error("Payroll dates must be valid.");
  }
  if (periodEnd < periodStart) throw new Error("Payroll period end must not precede its start.");
  if (leavingDate && leavingDate < joiningDate) throw new Error("Leaving date must not precede joining date.");

  const day = 86_400_000;
  const start = Math.floor(periodStart.getTime() / day);
  const end = Math.floor(periodEnd.getTime() / day);
  const join = Math.floor(joiningDate.getTime() / day);
  const leave = leavingDate ? Math.floor(leavingDate.getTime() / day) : end;
  const periodDays = end - start + 1;
  const eligibleStart = Math.max(start, join);
  const eligibleEnd = Math.min(end, leave);
  const eligibleDays = Math.max(0, eligibleEnd - eligibleStart + 1);
  const base = decimal(input.baseSalaryBdt);
  if (!base.isFinite() || base.isNegative() || base.decimalPlaces() > 2) {
    throw new Error("Base salary must be a non-negative BDT amount with at most two decimals.");
  }
  return {
    amountBdt: roundMoney(base.mul(eligibleDays).div(periodDays)),
    eligibleDays,
    periodDays,
  };
}

/**
 * Rates are deliberately supplied by the college's approved payroll policy.
 * This helper does not invent Bangladesh tax, provident-fund, or other statutory rates.
 */
export function calculatePayroll(input: {
  baseSalaryBdt: Prisma.Decimal | string | number;
  allowancesBdt?: Prisma.Decimal | string | number;
  deductions: DeductionRule[];
}): { grossBdt: Prisma.Decimal; deductionsBdt: Prisma.Decimal; netBdt: Prisma.Decimal; deductions: Array<{ name: string; amountBdt: Prisma.Decimal }> } {
  const base = decimal(input.baseSalaryBdt);
  const allowances = decimal(input.allowancesBdt ?? 0);
  if (![base, allowances].every((amount) => amount.isFinite() && !amount.isNegative() && amount.decimalPlaces() <= 2)) {
    throw new Error("Salary and allowances must be non-negative BDT amounts with at most two decimals.");
  }
  const grossBdt = roundMoney(base.add(allowances));
  const deductions = input.deductions.filter((rule) => rule.enabled).map((rule) => {
    const rate = decimal(rule.rate);
    const taxableBase = decimal(rule.taxableBaseBdt ?? grossBdt);
    if (!rate.isFinite() || rate.isNegative() || rate.greaterThan(1)) {
      throw new Error(`Deduction rate for ${rule.name} must be between 0 and 1.`);
    }
    if (!taxableBase.isFinite() || taxableBase.isNegative() || taxableBase.greaterThan(grossBdt)) {
      throw new Error(`Deduction base for ${rule.name} must be between zero and gross salary.`);
    }
    return { name: rule.name, amountBdt: roundMoney(taxableBase.mul(rate)) };
  });
  const deductionsBdt = roundMoney(deductions.reduce((total, item) => total.add(item.amountBdt), new Prisma.Decimal(0)));
  if (deductionsBdt.greaterThan(grossBdt)) throw new Error("Total deductions cannot exceed gross salary.");
  return { grossBdt, deductionsBdt, netBdt: roundMoney(grossBdt.sub(deductionsBdt)), deductions };
}
