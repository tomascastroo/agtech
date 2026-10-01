# syntax=docker/dockerfile:1
# API NestJS y worker BullMQ (misma imagen, distinto comando). Contexto de build: raíz del repo.

FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
# Opcional: CA adicional para redes con proxy de inspección TLS (no se copia a la imagen final).
#   docker build --secret id=extra_ca,src=/ruta/ca.crt ...
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then cat /run/secrets/extra_ca >> /etc/ssl/certs/ca-certificates.crt; fi
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

FROM base AS build
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @agrogarantias/api...
COPY apps/api apps/api
RUN pnpm --filter @agrogarantias/api build

FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @agrogarantias/api...

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=prod-deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY apps/api/package.json ./apps/api/
# Imágenes sintéticas para el seed demo y las señales simuladas de cámaras/satélite.
COPY infra/seed-assets ./seed-assets
WORKDIR /app/apps/api
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
