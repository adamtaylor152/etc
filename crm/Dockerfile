# etc. CRM. Coolify: base directory /crm, build pack Dockerfile, port 3000.
FROM node:24-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm prisma generate && pnpm build

# Migrations + seed run at container start from a small, separate toolbox (the standalone app has no CLI).
FROM node:24-slim AS migrate
WORKDIR /opt/migrate
RUN npm init -y >/dev/null && npm i --omit=dev --no-audit --no-fund \
      prisma@7.10.1 @prisma/client@7.10.1 @prisma/adapter-pg@7.10.1 pg dotenv tsx

FROM node:24-slim AS run
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 app && mkdir -p /data/uploads && chown -R app /data
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 UPLOAD_DIR=/data/uploads
COPY --from=build --chown=app /app/.next/standalone ./
COPY --from=build --chown=app /app/.next/static ./.next/static
COPY --from=build --chown=app /app/public ./public
COPY --from=migrate --chown=app /opt/migrate/node_modules /opt/migrate/node_modules
COPY --from=build --chown=app /app/prisma /opt/migrate/prisma
COPY --from=build --chown=app /app/prisma.config.ts /opt/migrate/
COPY --from=build --chown=app /app/src/generated /opt/migrate/src/generated
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s CMD node -e "fetch('http://127.0.0.1:3000/api/healthz?live=1').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Prisma takes an advisory lock, so two containers starting together won't both migrate. Seed is idempotent.
CMD ["sh", "-c", "cd /opt/migrate && node_modules/.bin/prisma migrate deploy && node_modules/.bin/tsx prisma/seed.ts && cd /app && exec node server.js"]
