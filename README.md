# CampusHub

CampusHub is a multi-institution digital-campus application built with Next.js,
TypeScript, Prisma, and PostgreSQL. It brings academic workflows, campus
communications, social activity, administration, and campus services into one
role-aware web app.

This repository is an actively developed foundation, **not a finished or
production-ready university platform**. Several workflows have a usable UI and
API, while other areas are data-model foundations or early integrations.
Review the limitations below before using it with real institutional or student
data.

## Requirements

- Node.js 20.9 or later
- PostgreSQL
- An email provider for invitations and password resets (Resend is currently
  integrated)

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and set every required secret and service URL.
   Generate a strong, private `BOOTSTRAP_SECRET` of at least 24 characters.
3. Create a PostgreSQL database and set `DATABASE_URL`.
4. Generate the client and create/apply the initial local database migration:

   ```bash
   npm run db:generate
   npm run db:migrate
   ```

5. Start the development server:

   ```bash
   npm run dev
   ```

6. Visit [http://localhost:3000](http://localhost:3000). If the database has no
   institutions, the sign-in page offers initial setup. Create the first
   institution and super-admin using the `BOOTSTRAP_SECRET`. The secret is
   checked server-side and is never stored in the database.

For production, configure the environment with your hosting provider, run
`npm run db:deploy` against the intended database, and deploy the generated
Next.js application. Do not use the development migration command in production.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string used by Prisma |
| `BOOTSTRAP_SECRET` | For first setup | Private initial-setup credential; at least 24 characters |
| `APP_URL` | For email links | Public base URL, for example `https://campus.example.edu` |
| `EMAIL_FROM` | For email | Verified sender address for invitations and password resets |
| `RESEND_API_KEY` | For email | Resend API key; keep it in deployment secrets |

Invitation and recovery messages require working email configuration. Do not
commit `.env` or provider credentials.

## Implemented foundation

- Institution-scoped records and multiple active roles per user
- Password hashing, database-backed sessions, sign-in throttling, logout, and
  membership switching
- Initial institution bootstrap, invitation acceptance, and password recovery
- Role-aware dashboard with server-backed overview and module navigation
- Initial academic, coursework, transcript, guardian, announcement, messaging,
  campus-social, events, career, research, campus-service, support, and
  administration APIs
- Separate private conversations and official university channels
- Informational fee records only; there is no payment processing

## Limitations and operational cautions

- The Prisma schema contains broader planned entities than the application
  currently exposes as complete user workflows. File storage/uploads, push
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

CampusHub intentionally excludes payment gateways, checkout, transactions,
bank integrations, payment webhooks, and transaction-generated receipts.
