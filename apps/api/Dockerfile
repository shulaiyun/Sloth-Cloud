FROM node:22-alpine AS builder

WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/tsconfig.json apps/api/README.md ./apps/api/

RUN pnpm install --frozen-lockfile

COPY apps/api/src ./apps/api/src

RUN pnpm --filter @sloth-cloud/api build

FROM node:22-alpine AS runtime

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/tsconfig.json ./apps/api/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /workspace/apps/api/dist ./apps/api/dist

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

CMD ["node", "/app/apps/api/dist/index.js"]
