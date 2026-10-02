# golf-scheduler

Tee times, availability, and pairings for the Young Retiree League. It replaced the Base44 app. Next.js with Prisma on Postgres.

It runs on the SYLLC cluster at https://golf.syllc.net. The manifests live in the platform repo under `k8s-core/golf-scheduler`.

## Local dev

You need devbox and direnv. Everything else comes from `devbox.json`.

```bash
direnv allow
devbox run setup    # installs deps, starts Postgres on 5433, applies migrations
devbox run dev      # http://localhost:3000
```

Sign up as Sajay Rai to get an admin locally. `ADMIN_PLAYERS` in `devbox.json` controls that.

## How sign in works

Golfers sign up with a username and password. They can only sign up as a name on the HI tab of the handicap sheet, and only one account per name. The roster is checked on every request, so taking someone off the sheet locks them out within about 10 minutes.

Admins are listed by roster name in `ADMIN_PLAYERS`, comma separated. Admins reset forgotten passwords from the Accounts tab.

Without a Google service account the app uses the copy of the roster in `src/server/roster.js`. That is fine for local dev but goes stale, so production should have the key.

## Settings

League constants like the tee interval, scramble team percentage, commissioners, courses, and the sheet links are on the Settings tab of the admin dashboard. Defaults live in `src/lib/settings.js`.

## Config

All runtime, so one image works anywhere.

| Variable | What it does |
|---|---|
| `DATABASE_URL` | Postgres connection. CNPG provides it in the cluster. |
| `ADMIN_PLAYERS` | Roster names that get the admin dashboard. |
| `SIGNUP_CODE` | Optional shared code golfers enter to sign up. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Service account key. Share both sheets with its email as an editor. |
| `SMTP_URL` and `MAIL_FROM` | Any SMTP relay, for pairing and availability emails. |

## Release

```bash
./scripts/build-push.sh 0.1.1
```

Then bump the two image refs in the platform repo and push. Argo CD rolls it out. The init container runs `prisma migrate deploy` first, so a bad migration blocks the rollout instead of breaking the app.

New schema changes go in with `prisma migrate dev --name what_changed` locally.
