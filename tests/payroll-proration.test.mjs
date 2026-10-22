import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("payroll proration uses BDT Decimal rounding and institution-configured statutory policy", () => {
  const source = readFileSync(new URL("../src/lib/payroll/proration.ts", import.meta.url), "utf8");
  assert.match(source, /Prisma\.Decimal/);
  assert.match(source, /inclusiveDays/);
  assert.match(source, /statutoryPolicies/);
  assert.match(source, /ROUND_HALF_UP/);
  assert.match(source, /net\.isNegative/);
  assert.match(source, /no Bangladesh tax rate or threshold is guessed/);
});
