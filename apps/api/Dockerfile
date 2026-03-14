FROM node:24-alpine
RUN npm install -g pnpm
RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY packages/db ./packages/db
COPY apps/api ./apps/api

RUN addgroup -g 1001 -S nodejs && adduser -S ovpn -u 1001
ENV NODE_ENV=production
RUN mkdir -p /data && chown -R ovpn:nodejs /data
USER ovpn
EXPOSE 3001
CMD ["npx", "tsx", "apps/api/src/index.ts"]
