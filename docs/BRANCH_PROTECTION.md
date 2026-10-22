# Production branch protection checklist

Configure this in **Settings → Rules → Rulesets** (or Branches → branch protection rules) for the `main` branch.

- Require a pull request before merging.
- Require at least **1 approving review**; dismiss stale approvals when new commits are pushed.
- Require status checks to pass before merging. Select the exact check name emitted by the workflow, **`test:ci`** (the job name), and ensure it runs on pull requests.
- Require branches to be up to date before merging.
- Require conversation resolution.
- Block force pushes and branch deletion.
- In a ruleset, enable **Do not allow bypassing the above settings** and include administrators/owners in enforcement. For classic branch protection, enable **Include administrators**.
- Restrict direct pushes to `main`; use pull requests only.
- Keep repository Actions permissions least-privileged and pin third-party actions to reviewed versions/SHAs where feasible.

**Important:** `npm audit --audit-level=high` intentionally fails CI while high/critical advisories remain. Fix or explicitly document each dependency update; do not lower the threshold to make the build green.
