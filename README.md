# Golf League Scheduler

A full-stack web app that runs the day-to-day operations of a golf league: tee times, player availability, pairings, and roster management. I designed and built it from the ground up to replace the league's original no-code app (built on Base44) with a faster, more secure, fully custom application.

## Highlights

- **Rebuilt from a no-code platform into a production Next.js app.** I migrated the league off Base44 to a custom stack I own end to end, with a real database, authentication, and deployment pipeline.
- **Roster-based authentication.** Golfers can only register under a name on the league roster, one account per name. Access is checked on every request, so removing a player revokes access immediately.
- **Safe Google Sheets sync with admin review.** The league tracks handicaps in a shared spreadsheet. Instead of trusting the sheet blindly, the app detects adds, removals, and handicap changes, and an admin approves each change before it's applied. Editing the sheet never grants anyone access.
- **Admin dashboard.** Admins manage the roster, reset passwords, and configure league settings (tee intervals, scramble team rules, courses, commissioners) without touching code.
- **Automated email notifications** for pairings and availability through any SMTP provider.
- **Production deployment on Kubernetes.** The app ships as a single Docker image configured entirely at runtime, deployed with Argo CD (GitOps). Database migrations run in an init container, so a bad migration blocks the rollout instead of breaking the live app.
- **Reproducible developer setup.** One command sets up dependencies, a local Postgres database, and migrations using devbox and direnv.

## Tech stack

| Area | Tools |
|---|---|
| Frontend & backend | Next.js, React, JavaScript |
| Database | PostgreSQL, Prisma ORM |
| Integrations | Google Sheets API, SMTP email |
| Infrastructure | Docker, Kubernetes, Argo CD, CloudNativePG |
| Developer tooling | devbox, direnv, ESLint, pnpm |

## What I learned

<!-- Write 2–4 sentences in your own words. For example: the hardest problem you solved, a design decision you're proud of, or what you'd do differently next time. Recruiters love this section. -->

## Running locally

You need devbox and direnv. Everything else comes from `devbox.json`.

```bash
direnv allow
devbox run setup    # installs deps, starts Postgres on 5433, applies migrations
devbox run dev      # http://localhost:3000
```

To get admin access locally, sign up as a player whose name is listed in `ADMIN_PLAYERS`.

## Configuration

All configuration happens at runtime, so one image works in any environment.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `ADMIN_PLAYERS` | Comma-separated roster names with admin access |
| `SIGNUP_CODE` | Optional shared code required to sign up |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Service account key for writing to the league sheets |
| `SMTP_URL`, `MAIL_FROM` | Email delivery for pairing and availability notices |

## Deployment

```bash
./scripts/build-push.sh <version>
```

Argo CD rolls out the new image. The init container runs `prisma migrate deploy` before the app starts. New schema changes are created locally with `prisma migrate dev --name what_changed`.
