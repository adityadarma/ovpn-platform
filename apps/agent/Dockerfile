FROM node:24-alpine
RUN npm install -g pnpm

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/agent/package.json ./apps/agent/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile

COPY apps/agent ./apps/agent
COPY packages/shared ./packages/shared

ENV NODE_ENV=production
CMD ["npx", "tsx", "apps/agent/src/index.ts"]
