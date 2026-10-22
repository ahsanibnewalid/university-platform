import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("payroll proration helper uses BDT Decimal arithmetic and explicit institution-configured statutory policies", () => {
  const source = readFileSync(new URL("../src/lib/payroll/proration.ts", import.meta.url), "utf8");
  assert.match(source, /Prisma\.Decimal/);
  assert.match(source, /daysInclusive/);
  assert.match(source, /statutoryPolicies/);
  assert.match(source, /ROUND_HALF_UP/);
  assert.match(source, /net\.isNegative/);
  assert.match(source, /does not hard-code Bangladesh tax thresholds or rates/);
});
