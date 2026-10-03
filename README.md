# CampusHub

CampusHub is a multi-institution digital-campus application built with Next.js,
TypeScript, Prisma, and PostgreSQL. Its product vision brings academic
workflows, campus communications, social activity, administration, careers, and
campus services into one role-aware web app.

The intended audience includes students, parents and guardians, faculty,
administrators, university leadership, recruiters, campus businesses, and
specialized medical and law programs. The product is designed for multiple
roles per person, institution-level data separation, and desktop and mobile web.

This repository is an actively developed foundation, **not a finished or
production-ready university platform**. Several workflows have a usable UI and
API, while other areas are data-model foundations or early integrations.
Review the limitations below before using it with real institutional or student
data.

## Product areas

- **Academics:** courses, registration, departments, programs, terms,
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
| `APP_URL` | For email links | Public base URL, for example `https://campus.example.edu` |
| `EMAIL_FROM` | For email | Verified sender address for invitations and password resets |
| `RESEND_API_KEY` | For email | Resend API key; keep it in deployment secrets |

Invitation and recovery messages require working email configuration. Do not
commit `.env` files, Neon credentials, or provider secrets.

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
- Neon branch configuration with a private `uploads` bucket policy
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

## Repository

https://github.com/ahsanibnewalid/university-platform
