# CampusHub

CampusHub is a single-university digital-campus application built with Next.js,
TypeScript, Prisma, and PostgreSQL. Its product vision brings academic
workflows, campus communications, social activity, administration, careers, and
campus services into one role-aware web app.

The intended audience includes students, parents and guardians, teachers,
department leadership, university offices, specialist campus staff, recruiters,
campus businesses, and specialized medical and law programs. People can hold
multiple roles at the university, with private records scoped by role.

This repository is an actively developed foundation, **not a finished or
production-ready university platform**. Several workflows have a usable UI and
API, while other areas are data-model foundations or early integrations.
Review the limitations below before using it with real institutional or student
data.

## Product areas

- **Academics:** courses, registration, faculties, departments, programs,
  batches, student and teacher profiles, academic years, terms, timetables,
  assignments, attendance, exams, results, and transcripts
- **Community and social:** campus feed, communities, posts, comments,
  reactions, polls, events, and notifications
- **Communication:** private conversations, official university channels,
  announcements, and support
- **Campus life:** services, lost and found, library, housing, transit, and
  emergency information
- **Careers and collaboration:** internships, jobs, companies, recruiters, and
  research collaboration
- **Administration:** institution membership, invitations, role-aware access,
  and reporting
- **Finance:** fee structures, student invoices, SSLCommerz hosted checkout,
  server-verified payments, receipts, and refund request records

## Requirements

- Node.js 20.9 or later
- PostgreSQL (a Neon development branch is configured for this workspace)
- An email provider for invitations and password resets (Resend is currently
  integrated)

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` if you do not already have a local
   environment file. Set the database URL, and configure a private
   `BOOTSTRAP_SECRET` of at least 24 characters. For Neon, link or check out a
   development branch with the Neon CLI to populate its database URLs.
3. Generate the Prisma client and apply migrations to your development database:

   ```bash
   npm run db:generate
   npm run db:migrate
   ```

   Neon migrations require a **direct, unpooled** database URL. This workspace's
   Neon-linked `.env.local` contains both pooled `DATABASE_URL` and direct
   `DATABASE_URL_UNPOOLED`; do not migrate against production while developing.
4. Start the development server:

   ```bash
   npm run dev
   ```

5. Visit [http://localhost:3000](http://localhost:3000). If the database has no
   institutions, the sign-in page offers initial setup. Create the first
   institution and super-admin using the `BOOTSTRAP_SECRET`. The secret is
   checked server-side and is never stored in the database.

For production, configure environment variables with your hosting provider, run
`npm run db:deploy` against the intended database, and deploy the Next.js
application. Do not use the development migration command in production.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL pooled connection string for app traffic |
| `DATABASE_URL_UNPOOLED` | For Neon migrations | Direct connection string for Prisma Migrate |
| `BOOTSTRAP_SECRET` | For first setup | Private initial-setup credential; at least 24 characters |
| `APP_URL` | For email and payments | Public base URL, for example `https://campus.example.edu` |
| `EMAIL_FROM` | For email | Verified sender address for invitations and password resets |
| `RESEND_API_KEY` | For email | Resend API key; keep it in deployment secrets |
| `SSLCOMMERZ_MODE` | For online payments | `sandbox` (default) or `live`; live mode requires HTTPS |
| `SSLCOMMERZ_STORE_ID` | For online payments | SSLCommerz merchant store ID; keep it in deployment secrets |
| `SSLCOMMERZ_STORE_PASSWORD` | For online payments | SSLCommerz merchant password; keep it in deployment secrets |

Invitation and recovery messages require working email configuration. Do not
commit `.env` files, Neon credentials, or provider secrets.

## Implemented foundation

- Single-university data model and multiple active roles per user
- Foundational university hierarchy, profiles, academic years, classrooms, and
  recurring class schedules
- Expanded role vocabulary for registrar, exam, finance, department, and
  campus-service responsibilities
- Password hashing, database-backed sessions, sign-in throttling, logout, and
  membership switching
- Initial institution bootstrap, invitation acceptance, and password recovery
- Role-aware dashboard with server-backed overview and module navigation
- Initial academic, coursework, transcript, guardian, announcement, messaging,
  campus-social, events, career, research, campus-service, support, and
  administration APIs
- Separate private conversations and official university channels
- Neon branch configuration with a private `uploads` bucket policy
- Fee structures and invoices, SSLCommerz hosted checkout, server-side
  transaction validation, idempotent payment settlement, receipts, and
  institution-scoped refund request records

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
