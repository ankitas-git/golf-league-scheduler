FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@10.33.4 --activate

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/
COPY prisma.config.js ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# The node user is uid 1000, matching the pod securityContext. It only needs to read /app.
USER node
EXPOSE 3000
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0

# next directly rather than through pnpm, so corepack never runs at startup.
CMD ["node_modules/.bin/next", "start"]
