# Stage 1: Base image 
FROM node:22-alpine AS base

# Update npm to the latest version to prevent warnings
RUN npm install -g npm@latest

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# Stage 2: Rebuild the source code only when needed
FROM base AS builder
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Argument to determine if this is a Render deployment
ARG RENDER
ENV RENDER=${RENDER}

# Conditionally use the PostgreSQL schema if RENDER is set
RUN if [ "$RENDER" = "true" ]; then \
      echo "Render deployment detected. Swapping to PostgreSQL schema..." && \
      rm -rf prisma/migrations prisma/schema.prisma && \
      cp prisma/postgres/schema.prisma prisma/schema.prisma && \
      cp -r prisma/postgres/migrations prisma/migrations; \
    else \
      echo "Local deployment detected. Using SQLite schema..."; \
    fi

# Generate Prisma client
RUN npx prisma generate

# Next.js telemetry is disabled
ENV NEXT_TELEMETRY_DISABLED=1

# Build the app
RUN npm run build

# Stage 3: Production image, copy all the files and run next
FROM base AS runner
RUN apk add --no-cache openssl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# We need the prisma CLI and its dependencies to run migrations
# Instead of rebuilding the node_modules, copy the built prisma dependency
# and importantly, the prisma wrapper from node_modules/.bin/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma

# Copy the entire .bin directory to ensure all wrapper scripts are available
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.bin ./node_modules/.bin

# Prisma needs to load some schema build wasm files, just copy all node_modules related to prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# Copy the generated Prisma Client
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma_static

# Copy public files
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir -p .next
RUN chown nextjs:nodejs .next

# Copy entrypoint script
COPY --chown=nextjs:nodejs entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

USER nextjs

EXPOSE 3000

ENV PORT=3000
# set hostname to localhost
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["/app/entrypoint.sh"]
