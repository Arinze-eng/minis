FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN corepack enable

COPY drip/dripadvisor/package.json drip/dripadvisor/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY drip/dripadvisor/ ./

ENV NODE_ENV=production
RUN pnpm run check
RUN pnpm run build

FROM node:22-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NODE_OPTIONS=--enable-source-maps

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/client/dist ./client/dist

EXPOSE 3000
CMD ["node", "dist/index.js"]
