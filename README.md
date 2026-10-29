# CampusHub

CampusHub is a single-college digital-campus application built with Next.js,
TypeScript, Prisma, and PostgreSQL. Its product vision brings academic
workflows, campus communications, social activity, administration, careers, and
campus services into one role-aware web app.

The intended audience includes students, parents and guardians, teachers,
department leadership, university offices, specialist campus staff, recruiters,
campus businesses, and specialized medical and law programs. People can hold
multiple roles at the university, with private records scoped by role.

This repository is configured for **Siddheswari College only**, with a single
institution. Students activate their college-issued student ID; employees
register only after the college approves their Gmail address and role. No one
can register another institution or grant themselves an administrator role.

This repository is an actively developed foundation, **not a finished or
production-ready university platform**. Several workflows have a usable UI and
API, while other areas are data-model foundations or early integrations.
Review the limitations below before using it with real institutional or student
data.

## Public website and cross-platform native mobile foundation (work in progress)

- The public `/` route presents a school-and-college website, role entry points,
  and public notices. Only announcements with an empty audience-role restriction
  and a publish date in the past are displayed to unauthenticated visitors.
- The dedicated `/parent` page serves verified parent accounts and reads
  institution-scoped family data from the existing dashboard API.
- Student portal access uses **college student ID + password** (web and React
  Native). First-time activation also requires a one-time college-issued code.
  Students can add verified Gmail later for notifications, email recovery and
  online payments; a Gmail address is not needed for basic academic access.
- Staff, teachers and principal accounts use **approved Gmail + password**.
  Email ownership is verified through a time-limited link, and appointment
  roles are assigned exclusively by college administration. The generic
  invitation signup UI/API has been retired.
- `mobile-app/` contains a React Native / Expo TypeScript project targeting
  **both Android and iOS** with native authenticated campus overview, notices,
  coursework, finance, requests and account screens. Device testing and push
  notifications are still pending.
- College exam results now require a grader, independent moderation and a
  deliberate publish step; previously published results remain readable.
- Privileged institution leaders can review an access-logged, scoped audit-event
  dashboard; sensitive finance record reads are audited without logging contents.
- The existing dashboards and APIs remain the foundation for student, teacher,
  parent, finance and administrator workflows. Features described in the
  database schema are not necessarily implemented end-to-end.

Before deploying to a real school, validate the institution's academic rules,
fee policies, guardian eligibility and legal privacy requirements. Complete
mobile authentication and device testing, run CI and production-security review,
and configure monitoring and backups. Do not use live student records during
unvalidated development.

## Product areas

- **Academics:** courses, registration, faculties, departments, programs,
  batches, student and teacher profiles, academic years, academic sessions,
  program enrollment with National University registration tracking, terms,
  timetables, assignments, attendance summaries, exams, results, and transcript records
- **Community and social:** campus feed, communities, posts, comments,
  reactions, polls, events, and notifications
- **Communication:** private conversations, official university channels,
  announcements, and support
- **Campus life:** services, lost and found, library, housing, transit, and
  emergency information
- **Careers and collaboration:** internships, jobs, companies, recruiters, and
  research collaboration
- **Administration:** institution membership, registrar-issued student IDs,
  approved staff Gmail onboarding, role-aware access,
  and reporting
- **Finance and HR:** BDT fee structures and invoices, SSLCommerz hosted checkout,
  server-verified/idempotent payment settlement, reconciliation audit logs,
  receipts, employee profiles, salary structures, payroll periods/runs,
  allowances, deductions, and payslips

## Requirements

- Node.js 20.9 or later
- PostgreSQL (a Neon development branch is configured for this workspace)
- An email provider for staff registration, optional student Gmail verification
  and password resets (Resend is currently
  integrated)

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` if you do not already have a local
   environment file. Set the database URL. For Neon, link or check out a
   development branch with the Neon CLI to populate its database URLs.
3. Generate the Prisma client and apply migrations to your development database:

   ```bash
   npm run db:generate
   npm run db:migrate
   ```

   Neon migrations require a **direct, unpooled** database URL. This workspace's
   Neon-linked `.env.local` contains both pooled `DATABASE_URL` and direct
   `DATABASE_URL_UNPOOLED`; do not migrate against production while developing.
4. For a **new empty database only**, provision the fixed Siddheswari College
   institution and its first super-admin **from the trusted server shell**.
   You must supply your own private administrator credentials. For Bash:

   ```bash
   export CAMPUS_ADMIN_NAME="Your approved administrator's name"
   export CAMPUS_ADMIN_EMAIL="your-approved-admin@example.com"
   read -rsp 'Initial administrator password: ' CAMPUS_ADMIN_PASSWORD
   export CAMPUS_ADMIN_PASSWORD
   npm run campus:bootstrap
   unset CAMPUS_ADMIN_PASSWORD
   ```

   The command creates exactly one institution named `Siddheswari College`
   with slug `siddheswari-college`. It refuses to run if any institution already
   exists; it never resets or replaces existing accounts. **No public setup
   endpoint or default administrator password exists.**

5. Start the development server:

   ```bash
   npm run dev
   ```

6. Visit [http://localhost:3000](http://localhost:3000) and sign in using the
   authorized administrator credentials established on the server. The registrar
   opens `/admin/onboarding` to issue student IDs/activation codes and approve
   employee Gmail addresses. Students activate at `/register/student`, then
   sign in by student ID and password; employees verify approved Gmail at
   `/register/staff` before choosing a password.

   **Never give a student activation code to someone without checking their
   college identity.** A student number by itself does not prove ownership.
   Activation codes expire after seven days, are displayed only when issued,
   and can be rotated by a registrar before use.

If an **existing** deployment was previously initialized with generic or demo
institution branding, take an approved database backup first, then a trusted
operator can run:

```bash
CAMPUS_CONFIRM_REBRAND="Siddheswari College" npm run campus:rebrand
```

This only corrects the single institution's name and slug; it preserves users,
membership relationships and academic records. It does not reset passwords.

For production, configure environment variables with your hosting provider, run
`npm run db:deploy` against the intended database, and deploy the Next.js
application. Do not use the development migration command in production.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL pooled connection string for app traffic |
| `DATABASE_URL_UNPOOLED` | For Neon migrations | Direct connection string for Prisma Migrate |
| `CAMPUS_ADMIN_NAME` | First-time CLI setup | Approved administrator name; set only for `npm run campus:bootstrap` |
| `CAMPUS_ADMIN_EMAIL` | First-time CLI setup | Approved administrator email; set only for `npm run campus:bootstrap` |
| `CAMPUS_ADMIN_PASSWORD` | First-time CLI setup | Secure initial administrator password; set only for `npm run campus:bootstrap` |
| `APP_URL` | For email and payments | Public base URL, for example `https://campus.example.edu` |
| `EMAIL_FROM` | For email | Verified sender address for staff registration, student Gmail verification and password resets |
| `RESEND_API_KEY` | For email | Resend API key; keep it in deployment secrets |
| `SSLCOMMERZ_MODE` | For online payments | `sandbox` (default) or `live`; live mode requires HTTPS |
| `SSLCOMMERZ_STORE_ID` | For online payments | SSLCommerz merchant store ID; keep it in deployment secrets |
| `SSLCOMMERZ_STORE_PASSWORD` | For online payments | SSLCommerz merchant password; keep it in deployment secrets |

Email onboarding and recovery require working mail configuration and an HTTPS
`APP_URL` in production. While the Azure deployment is still accessible over
HTTP by IP address, complete HTTPS/domain setup before enabling Gmail
registration or real account login. Do not
commit `.env` files, Neon credentials, or provider secrets.

## Implemented foundation

- Single-university data model and multiple active roles per user
- Foundational university hierarchy, profiles, academic years, classrooms, and
  recurring class schedules
- Expanded role vocabulary for registrar, exam, finance, department, and
  campus-service responsibilities
- Password hashing, database-backed sessions, sign-in throttling, logout, and
  membership switching
- Initial institution bootstrap, student-ID activation, verified staff Gmail
  onboarding, optional student Gmail verification and password recovery
- Role-aware dashboard with server-backed overview and module navigation
- Initial academic, coursework, transcript, guardian, announcement, messaging,
  campus-social, events, career, research, campus-service, support, and
  administration APIs
- Separate private conversations and official university channels
- Neon branch configuration with a private `uploads` bucket policy
- Fee structures and invoices in BDT, signed SSLCommerz callback verification,
  server-side transaction validation, idempotent settlement/reconciliation,
  receipts, and institution-scoped refund records
- Siddheswari program types, academic sessions, NU registration-aware academic
  enrollments, class attendance summaries, program-specific grade-point
  policies, employee profiles, effective-dated salaries, and transactional
  payroll runs/payslips

## Parent and student leave requests

The `/leave-requests` page and `/api/leave-requests` provide an auditable
request/review workflow:

- Students may request their own leave; parents may request leave only for
  verified, active linked students in the current institution.
- Teachers and faculty can review only students assigned to sections they teach;
  specified academic administrators can review requests institution-wide.
- Requests are date-validated and limited to a reasonable range; only pending
  requests can be reviewed. Requests and reviews are audit-logged, and the
  requester/student receive a notification after review.
- **Approval does not automatically alter attendance records.** Attendance
  corrections must follow the institution's separate approved process.

Apply `prisma/migrations/20261028010000_parent_leave_requests` to a disposable
development database first, regenerate Prisma Client, and run the project's
lint/typecheck/test/build checks before production deployment. This new workflow
has not been end-to-end tested against a configured database in this session.

## Parent–teacher appointment requests

The `/appointments` page and `/api/appointments` provide a request/confirmation
workflow. Verified parents can request appointments only with active teachers
assigned to their child. Teachers may confirm or decline requests, and parents
may cancel their own pending requests. Changes are audit-logged and notify the
other party. The requested time is **not confirmed** until accepted.

Apply `prisma/migrations/20261028011000_parent_teacher_appointments` after
the leave-request migration in a disposable development database. It has not
yet been tested with real institutional schedules, and does not provide room
booking, reminders, calendar invitations or conflict resolution. Obtain
institution-approved scheduling rules before a production launch.

## Migration preflight for legacy fee records

The new fee-record foreign key is added as PostgreSQL `NOT VALID` so legacy
orphaned rows do not block deployment while new writes are immediately checked.
Before validating the constraint in a production database, take a verified
backup and run:

```sql
SELECT fr."id", fr."studentId"
FROM "FeeRecord" AS fr
LEFT JOIN "User" AS u ON u."id" = fr."studentId"
WHERE u."id" IS NULL;
```

Resolve any returned rows using an approved data-repair plan; do not invent
student identities. After the query returns no rows, validate the constraint:

```sql
ALTER TABLE "FeeRecord"
  VALIDATE CONSTRAINT "FeeRecord_studentId_fkey";
```

## Siddheswari academic catalogue seed

The seed command is deliberately configuration-driven: it never invents department
codes, student records, or grading policies. First create the institution and
approved departments, then provide the exact program catalogue to seed.

Example (replace the slug and department code with values that exist in the
target database):

```bash
export SEED_INSTITUTION_SLUG="siddheswari-college"
export SIDDHESWARI_PROGRAMS_JSON='[
  {
    "departmentCode": "REPLACE_WITH_APPROVED_CODE",
    "name": "HSC Science",
    "code": "HSC-SCI",
    "level": "HSC",
    "programType": "HSC"
  }
]'
npm run db:seed
```

The seeder is idempotent: existing department/program-code pairs are left
unchanged. It does not seed GradePoint values because HSC and National
University programs require college-approved grading policies.

## SSLCommerz sandbox and refunds

1. Obtain sandbox merchant credentials from SSLCommerz and set
   `SSLCOMMERZ_MODE=sandbox`, `SSLCOMMERZ_STORE_ID`, and
   `SSLCOMMERZ_STORE_PASSWORD` in `.env.local` or your deployment secret store.
   Keep these values server-side; never add them to client-side variables.
2. Set `APP_URL` to the app's public URL. SSLCommerz must be able to reach the
   `/api/sslcommerz/success`, `/api/sslcommerz/fail`,
   `/api/sslcommerz/cancel`, and `/api/sslcommerz/ipn` routes. For local
   end-to-end sandbox testing, use an HTTPS tunnel; `localhost` is not reachable
   by the payment provider.
3. Apply the development database migrations, sign in with a finance role,
   create a BDT fee structure, and issue an invoice to an active student. Sign
   in as that student (or a verified guardian), open **Fees & payments**, and
   start checkout. Only a server-validated SSLCommerz transaction creates a
   payment and receipt. Test failure, cancellation, and duplicate callbacks as
   well; none should be treated as successful without server-side validation.
4. To enable live payments, use SSLCommerz live merchant credentials, set
   `SSLCOMMERZ_MODE=live`, and use a publicly reachable HTTPS `APP_URL`. Live
   payment processing has not been verified in this repository environment.

CampusHub records refund requests and finance-confirmed outcomes, but does not
initiate a refund through SSLCommerz. Finance staff must process the refund
through the merchant's approved gateway workflow first, then record its
reference and outcome in CampusHub. Verified payments flagged for review are
not automatically applied to invoices and require finance reconciliation.

## Limitations and operational cautions

- The Prisma schema contains broader planned entities than the application
  currently exposes as complete user workflows. The new foundation models and
  role values require a development-database migration before use. File
  storage/uploads, push
  delivery, full moderation and retention tooling, and several library, hostel,
  transit, emergency, and document workflows still need implementation.
- GPA/transcript behavior needs validation against each institution's grading
  and credit policies. Specialized medical and law workflows are not a
  substitute for institution-approved systems.
- There is no seeded demo institution or automated end-to-end test environment.
  Exercise APIs against a disposable database before deployment.
- Email, database migration, production hosting, backups, monitoring, and
  institution-specific role/retention policies must be configured and tested by
  the deploying institution.
- Do not treat this repository as audited, compliant, or ready for live student
  records without a dedicated security, privacy, and operational review.

## Repository

https://github.com/ahsanibnewalid/university-platform
