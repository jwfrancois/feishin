# syntax=docker/dockerfile:1
# Feishin (web rebuild) — production image for desktop / NAS self-hosting.
#
#   docker build -t feishin-web .
#   docker run -d --name feishin -p 3000:3000 --env-file .env feishin-web
#
# Or with docker compose (recommended — persists the database and cache):
#   docker compose up -d --build
#
# The Jellyfin connection comes from the environment (JELLYFIN_URL,
# JELLYFIN_USERNAME, JELLYFIN_PASSWORD, JELLYFIN_API_KEY). If unset, the app
# starts on its "Add server" login screen and you configure it in the UI.

# ---------------------------------------------------------------- deps
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile

# ---------------------------------------------------------------- build
FROM oven/bun:1 AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# dummy URL so the Prisma client instantiates during the build (never connects)
ENV DATABASE_URL=file:/app/db/custom.db
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bunx prisma generate
# project build script: next build && cp static+public into .next/standalone
RUN bun run build

# ---------------------------------------------------------------- run
FROM oven/bun:1 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
# Library-Agent SQLite database (override with DATABASE_URL if you like)
ENV DATABASE_URL=file:/app/db/custom.db

# standalone Next.js server (server.js + minimal node_modules + .next/static + public)
COPY --from=builder /app/.next/standalone ./
# full toolchain so the first boot can `prisma db push` the SQLite schema
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

RUN mkdir -p /app/db /app/.cache
VOLUME ["/app/db", "/app/.cache"]
EXPOSE 3000

# bootstrap the agent database schema, then serve
CMD ["sh", "-c", "bunx prisma db push --skip-generate && bun server.js"]
