# Siddheswari College — deployment and recovery runbook

This project is a **production candidate**, not an authorized live college system.
The institution must approve its academic, privacy, financial and operational
policies before importing real student data or enabling payments.

## Release gates

1. Review the exact release commit and required database migrations.
2. Run `npm ci`, `npm run db:generate`, `npm run test:ci`, and `npm run build`.
3. On a **disposable PostgreSQL database**, run `npm run db:deploy`; exercise
   admissions, registration, guardian isolation, attendance, exams, fees,
   refunds, staff workflows and role changes using synthetic data.
   Test the exam-grade migration with both legacy published results and new
   draft→submitted→independently approved→published results. A grader must not
   be able to approve their own marks; staff cannot edit released results.
4. Verify production domain, TLS, environment secrets, mail sender and payment
   gateway settings. Never use the sandbox merchant for live settlements.
5. Have an independently verified database backup and documented recovery owner.
6. Run security and privacy review; explicitly approve the release with college
   management before any real records are migrated.

## Runtime configuration

This is a **single-college** deployment. Public HTTP institution registration is
disabled. On a new, empty database, run `npm run campus:bootstrap` from an
authorized server shell with `CAMPUS_ADMIN_NAME`, `CAMPUS_ADMIN_EMAIL`, and
`CAMPUS_ADMIN_PASSWORD` set securely; never put these credentials in the Git
repository or a publicly readable shell history. Do not repeat the command on
an existing database. If a previously installed college has demo branding,
verify a backup and use the explicitly confirmed `npm run campus:rebrand`
maintenance command. These operations never create a second college.

#### Existing college without an initial super administrator

If an existing, backed-up database contains the single, correctly named
Siddheswari College but was installed before an administrator was created,
an authorized server operator can run `npm run campus:admin-init -- --check`.
This read-only command reports whether any Super Admin membership or earlier
administrator initialization audit record exists. Do not run the normal
`campus:bootstrap` against an existing database.

Only when both counts are **zero**, the operator may run the server-only
`npm run campus:admin-init` command with the authorized person's Gmail,
name, a privately entered password and an explicit college confirmation:

```bash
export CAMPUS_ADMIN_NAME="Approved Administrator"
export CAMPUS_ADMIN_EMAIL="approved.account@gmail.com"
export CAMPUS_CONFIRM_FIRST_ADMIN="Siddheswari College"
read -rsp 'New administrator password (12+ characters): ' CAMPUS_ADMIN_PASSWORD
echo
export CAMPUS_ADMIN_PASSWORD
npm run campus:admin-init
unset CAMPUS_ADMIN_PASSWORD CAMPUS_CONFIRM_FIRST_ADMIN CAMPUS_ADMIN_NAME CAMPUS_ADMIN_EMAIL
```

Never paste a password into commands, logs, support chats, or `.env` files.
This operation cannot upgrade an existing user or issue a second administrator
if the college already has an administrator or prior initialization audit.
The resulting user must sign in at `/login`; do so only after HTTPS is live.

### Student ID and employee email onboarding

1. College management approves the registrar or principal accounts first.
   An authorized registrar uses `/admin/onboarding` to add the student's
   official ID and program to the college roster. No activation code is needed.
2. The student submits the ID and a personally chosen password at
   `/register/student`. This creates a **pending registration**, not an active
   membership. The registrar, principal, student-affairs officer or appointed
   department reviewer must verify the student's identity and official records
   before explicitly approving it. Approval and rejection are audited. The
   student then logs in using **student ID + password**; Gmail is optional for
   basic academic access. Rejected requests may be resubmitted.
3. An authorized principal or super administrator preapproves each employee's
   Gmail address and appointment role from the same registrar workspace.
   The employee verifies Gmail at `/register/staff`, then chooses a password.
   Only a super administrator can approve a principal appointment.
4. Students may link a verified Gmail later at `/student/email` for receipts,
   notices and password recovery. Never treat a submitted but unverified email
   as proof of account ownership. Online payment checkout requires verified
   email; the existing payment gateway has its own launch requirements.
5. Generic invitation signup is retired. Legacy invitation rows are retained
   for audit/data continuity, but new account creation goes through the approved
   roster workflows. Confirm that any formerly invited employees are now
   preapproved for Gmail registration.
6. Super Admin and Principal can manage approved employee appointment roles and
   suspend/reactivate non-Super-Admin memberships at `/admin/roles`. No web
   route can self-assign the Super Admin role. A suspended membership cannot
   authenticate or use a previously issued session.
   Department-review access additionally requires a department chair appointment
   in that same workspace; holding a role without an appointment does not grant
   access to a different department's student records.

**Production blocking requirement:** `APP_URL` must be the final HTTPS origin,
and `RESEND_API_KEY` plus `EMAIL_FROM` must be configured for staff Gmail
activation, student email verification and password recovery. The current
plain-HTTP Azure IP cannot be used for live credential registration.

See `.env.example` and `README.md` for variables. Use the host's secret store,
not a committed `.env` file. `DATABASE_URL_UNPOOLED` must point to a direct
connection for migrations. Prefer separate development, staging and production
databases and credentials with least privilege.

For a hosted Next.js deployment:

1. Deploy the exact tested commit with Node.js 22 or another version supported
   by the checked-in Next.js release.
2. Apply migrations using a controlled, one-time release job. Do not run
   `prisma migrate dev` against production.
3. Start the application with `npm run start` behind HTTPS and a reverse proxy.
4. Check `GET /api/health`: HTTP 200 means the app can execute a PostgreSQL
   query; HTTP 503 means readiness is unavailable. It intentionally exposes no
   database or secret details.
5. Smoke-test public pages, unauthenticated access restrictions and all
   privileged workflows with institution-approved test accounts.

## Monitoring and response

- Alert on sustained `/api/health` 503 responses, elevated 5xx error rate,
  abnormal authentication failures, payment reconciliation exceptions and
  database resource exhaustion.
- Preserve application errors and audit events in a controlled log store.
  Redact passwords, tokens, private academic content and payment details.
- Specify an incident owner, severity levels, escalation path and recovery
  communication process before launch.
- Monitor database storage, migration failures, backup failures, mail
  delivery failures and payment callback failures separately.

## Backup and recovery

- Enable encrypted, automated PostgreSQL backups and point-in-time recovery
  where supported by the hosting provider. Define retention with the college.
- Back up uploaded documents separately if/when file storage is implemented.
- Periodically restore an approved backup to an isolated **test** environment,
  measure recovery time, verify row counts and test student/guardian access.
- Never practice destructive restore commands against the production database.
- Keep backup access separate from the application credentials and log all
  restoration activity.

## Rollback

Revert the application deployment to the previous tested commit when safe.
Database migrations may not be reversible; favor additive migrations and a
written data-repair plan. Do not blindly run `migrate reset`, drop tables or
restore a snapshot over live records. Coordinate any data rollback with the
database owner and institution.

## Still needed

- True end-to-end authenticated tests and permissions matrix coverage
- Deployment pipeline, institution-authorized domains and provisioned secrets
- Database restore drill and security/privacy assessment
- Approved NU/board API contracts, credentials and policies
- Native mobile release signing, device testing and notification delivery
- Institution-approved mobile identity and account lifecycle (lost device,
  remote token revocation, Android/iOS app-store policies)
- Exam grade correction/appeal and official NU/board release reconciliation
