FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json .
COPY package-lock.json .
RUN npm ci

COPY . .

ARG VITE_API_BASE_URL=http://localhost:3001
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

ARG VITE_BUILD_VERSION=unknown
ENV VITE_BUILD_VERSION=$VITE_BUILD_VERSION

RUN npm run build

# Production image: serve the built files with nginx
FROM nginx:1.30-alpine

# Security patches
RUN apk upgrade --no-cache

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# SEC-07 cutover: compute NGINX_API_TOKEN from AUTH_ENABLED before the stock
# 20-envsubst-on-templates.sh renders the template (the 15- prefix orders it first).
# Must be *.envsh so the stock entrypoint SOURCES it (executed *.sh loses the export
# in a child process → literal ${NGINX_API_TOKEN} → nginx fails to start, CR-01).
COPY docker-entrypoint.d/15-compute-api-token.envsh /docker-entrypoint.d/15-compute-api-token.envsh
RUN chmod +x /docker-entrypoint.d/15-compute-api-token.envsh

# LISTENER_HOST default: 127.0.0.1 (NAS host-network mode)
# Override to "listener" when running in bridge mode (local dev via override file)
ENV LISTENER_HOST=127.0.0.1
ENV LISTENER_PORT=3001
ENV API_TOKEN=
ENV DOLLAR=$
# Fail-safe default matching listener index.js (auth on → real token suppressed, T-23-BYPASS)
ENV AUTH_ENABLED=true

EXPOSE 80
