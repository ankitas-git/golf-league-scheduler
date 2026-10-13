# golf-scheduler

Tee times, availability, and pairings for the Young Retiree League. Next.js app with Prisma on Postgres.

## Local dev

You need devbox and direnv. Everything else comes from `devbox.json`.

```bash
direnv allow
devbox run setup    # installs deps, starts Postgres on 5433, applies migrations
devbox run dev      # http://localhost:3000
```

## How sign in works

Golfers sign up with a username and password, plus the league signup code if `SIGNUP_CODE` is set. They can only sign up as a name on the roster, one account per name. The roster is checked on every request, so removing someone locks them out right away.

The roster lives in the database, not the sheet. The handicap sheet is editable by anyone with the link, so editing it never grants access by itself. On the Roster tab an admin clicks Check Sheet for Changes, reviews the adds, removals, and handicap changes, and approves the ones to apply. The check reads the sheet's public export and never writes to it.

Admins are listed by roster name in `ADMIN_PLAYERS`, comma separated. Admins reset forgotten passwords from the Accounts tab.

## Settings

League constants like the tee interval, scramble team percentage, commissioners, courses, and the sheet links are on the Settings tab of the admin dashboard. Defaults live in `src/lib/settings.js`.

## Config

All runtime, so one image works anywhere.

| Variable | What it does |
|---|---|
| `DATABASE_URL` | Postgres connection. CNPG provides it in the cluster. |
| `ADMIN_PLAYERS` | Roster names that get the admin dashboard. |
| `SIGNUP_CODE` | Optional shared code golfers enter to sign up. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Service account key, only needed for writing to the sheets. Share both sheets with its email as an editor. |
| `SMTP_URL` and `MAIL_FROM` | Any SMTP relay, for pairing and availability emails. |

## Release

```bash
./scripts/build-push.sh 0.1.1
```

Then bump the two image refs in the platform repo and push. Argo CD rolls it out. The init container runs `prisma migrate deploy` first, so a bad migration blocks the rollout instead of breaking the app.

New schema changes go in with `prisma migrate dev --name what_changed` locally.
