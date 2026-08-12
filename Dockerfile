# =============================================================================
# STAGE 1 — builder: compila TypeScript e gera Prisma Client para Alpine
# =============================================================================
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
# Gera o Prisma Client com binário correto para linux-musl (Alpine)
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# =============================================================================
# STAGE 2 — deps: instala APENAS dependências de produção
# =============================================================================
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# =============================================================================
# STAGE 3 — runner: imagem final mínima
# =============================================================================
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV NODE_ENV=production

# Usuário sem privilégios
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 expressjs

# Apenas o necessário para rodar:
# - dist/      → código compilado
# - node_modules/ (produção apenas)
# - prisma/    → schema + binário gerado para Alpine
COPY --from=builder --chown=expressjs:nodejs /app/dist ./dist
COPY --from=deps    --chown=expressjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=expressjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=expressjs:nodejs /app/prisma ./prisma
COPY --chown=expressjs:nodejs package.json ./

USER expressjs

EXPOSE 8080

CMD ["node", "dist/server.js"]
