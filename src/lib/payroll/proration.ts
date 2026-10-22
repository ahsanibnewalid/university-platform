import { Prisma } from "@prisma/client";

export type StatutoryDeductionPolicy = {
  code: string;
  rate: Prisma.Decimal.Value;
  basis: "PRORATED_BASE" | "GROSS";
  capAmount?: Prisma.Decimal.Value;
};
export type PayrollProrationInput = {
  monthlyBaseSalary: Prisma.Decimal.Value;
  periodStartsAt: Date;
  periodEndsAt: Date;
  hiredAt: Date;
  leftAt?: Date | null;
  allowances?: Prisma.Decimal.Value;
  statutoryPolicies: StatutoryDeductionPolicy[];
};
export type PayrollProrationResult = {
  currency: "BDT";
  periodDays: number;
  eligibleDays: number;
  prorationFactor: string;
  proratedBase: string;
  allowances: string;
  gross: string;
  statutoryDeductions: Array<{ code: string; amount: string; rate: string; basis: string }>;
  totalDeductions: string;
  net: string;
};
const money = (value: Prisma.Decimal.Value, label: string) => {
  const amount = new Prisma.Decimal(value);
  if (!amount.isFinite() || amount.isNegative() || amount.decimalPlaces() > 2) throw new Error(`${label} must be a non-negative BDT amount with at most two decimal places`);
  return amount;
};
const utcDay = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
const inclusiveDays = (start: Date, end: Date) => Math.floor((utcDay(end) - utcDay(start)) / 86_400_000) + 1;

/** Uses institution-approved effective rates; no Bangladesh tax rate or threshold is guessed. */
export function calculatePayrollProration(input: PayrollProrationInput): PayrollProrationResult {
  if (input.periodStartsAt > input.periodEndsAt) throw new Error("Payroll period start must not follow its end");
  if (input.hiredAt > input.periodEndsAt) throw new Error("Employee was hired after this payroll period");
  if (input.leftAt && input.leftAt < input.periodStartsAt) throw new Error("Employee left before this payroll period");
  const periodDays = inclusiveDays(input.periodStartsAt, input.periodEndsAt);
  const start = new Date(Math.max(utcDay(input.periodStartsAt), utcDay(input.hiredAt)));
  const end = new Date(Math.min(utcDay(input.periodEndsAt), input.leftAt ? utcDay(input.leftAt) : utcDay(input.periodEndsAt)));
  const eligibleDays = Math.max(0, inclusiveDays(start, end));
  const factor = new Prisma.Decimal(eligibleDays).div(periodDays);
  const proratedBase = money(input.monthlyBaseSalary, "Monthly base salary").mul(factor).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const allowances = money(input.allowances ?? 0, "Allowances");
  const gross = proratedBase.add(allowances).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const seen = new Set<string>();
  const statutoryDeductions = input.statutoryPolicies.map((policy) => {
    if (!/^[A-Z][A-Z0-9_]{1,39}$/.test(policy.code) || seen.has(policy.code)) throw new Error("Statutory deduction codes must be unique uppercase identifiers");
    seen.add(policy.code);
    const rate = new Prisma.Decimal(policy.rate);
    if (!rate.isFinite() || rate.isNegative() || rate.greaterThan(1)) throw new Error(`Rate for ${policy.code} must be between 0 and 1`);
    const basis = policy.basis === "PRORATED_BASE" ? proratedBase : gross;
    let amount = basis.mul(rate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    if (policy.capAmount !== undefined) amount = Prisma.Decimal.min(amount, money(policy.capAmount, `${policy.code} cap`));
    return { code: policy.code, amount: amount.toFixed(2), rate: rate.toString(), basis: policy.basis };
  });
  const totalDeductions = statutoryDeductions.reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const net = gross.sub(totalDeductions).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  if (net.isNegative()) throw new Error("Total deductions exceed gross pay");
  return { currency: "BDT", periodDays, eligibleDays, prorationFactor: factor.toFixed(6), proratedBase: proratedBase.toFixed(2), allowances: allowances.toFixed(2), gross: gross.toFixed(2), statutoryDeductions, totalDeductions: totalDeductions.toFixed(2), net: net.toFixed(2) };
}
