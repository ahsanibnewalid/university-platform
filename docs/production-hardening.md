# Production hardening checklist

## GitHub: protect `main`

In **Settings → Rules → Rulesets** (or **Branches → Add branch protection rule** on older GitHub settings), target the branch name pattern `main` and enable:

- Require a pull request before merging.
- Require at least **1 approval** from a reviewer other than the author; dismiss stale approvals when new commits are pushed.
- Require status checks to pass before merging and select the exact checks **`test:ci`** and **`dependency-audit`** from `.github/workflows/quality.yml`. Migration and build remain part of `test:ci`. Do not mark the audit as optional: the current lockfile has a high-severity transitive `braces` advisory, so this check blocks merges until the dependency path is remediated or a reviewed risk decision is made.
- Require branches to be up to date before merging.
- Require conversation resolution.
- Block force pushes and branch deletion.
- Enable **Do not allow bypassing the above settings** / apply rules to administrators. Do not grant bypass permissions to administrators or repository roles.
- Restrict direct pushes to `main`; make all changes through reviewed pull requests.

After saving the rule, open a harmless test PR and confirm GitHub blocks merging until the approval and `test:ci` checks are satisfied. Ruleset availability and labels vary by plan.

## Before importing live student or financial records

1. Take a verified database backup and rehearse restore into a separate database.
2. Set production secrets only in the deployment platform; never use CI sandbox credentials in production.
3. Run `npm run db:audit-migration` against a read-only/staging connection first. The report is dry-run only and exits with code 2 when orphan fee records or unresolved program classifications remain.
4. Review every program mapping with the Registrar against the approved Siddheswari College programme catalogue. Do not auto-apply suggestions.
5. Resolve orphan fee records only using an approved, auditable data-repair plan. Then validate the deferred FK constraint as documented in the migration notes.
6. Complete sandbox payment tests with the merchant's current SSLCommerz v4 contract, then test duplicate callbacks, risk review, cancellation races, partial payment and overpayment.
7. Run IDOR tests against a seeded disposable PostgreSQL database and load-test with anonymized fixtures before opening access to students.

## Payroll policy sign-off

Proration is calculated inclusively by calendar day. Deduction rates are explicit inputs; the helper intentionally does not assume legal/statutory rates. Before payroll use, the college must approve the day-count convention, rounding, tax and provident-fund rules, exemptions, caps, effective dates, and treatment of unpaid leave/holidays. Store the signed-off policy and test cases with the release evidence.
