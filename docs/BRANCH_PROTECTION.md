# Main branch protection

In **Settings → Rules → Rulesets**, target `main` and enable:

- Require pull requests before merging and at least one approval.
- Dismiss stale approvals and require conversation resolution.
- Require both **`test:ci`** and **`dependency-audit`** status checks.
- Require branches to be up to date before merging.
- Block force pushes and branch deletion.
- Enable **Do not allow bypassing the above settings**, including administrators/owners.
- Restrict direct pushes; merge only reviewed pull requests.

`npm audit --audit-level=high` intentionally blocks merging while high/critical advisories remain. Resolve advisories instead of lowering the threshold.
