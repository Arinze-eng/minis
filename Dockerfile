FROM node:22-bookworm-slim AS deps
WORKDIR /app/atlas-web
COPY atlas-web/package.json atlas-web/package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app/atlas-web
COPY --from=deps /app/atlas-web/node_modules ./node_modules
COPY atlas-web/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run typecheck && npm test && npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app/atlas-web
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/atlas-web/package.json ./package.json
COPY --from=builder /app/atlas-web/node_modules ./node_modules
COPY --from=builder /app/atlas-web/.next ./.next
COPY --from=builder /app/atlas-web/public ./public
COPY --from=builder /app/atlas-web/next.config.ts ./next.config.ts
EXPOSE 3000
CMD ["npm", "run", "start"]
