#!/bin/sh
# Applies prisma/migrations. Runs as the init container before the app starts.
set -e
exec node_modules/.bin/prisma migrate deploy
