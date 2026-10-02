# syntax=docker/dockerfile:1

# Build: type-check and bundle the app into dist/ (npm run build). npm's
# download cache persists between builds as a BuildKit cache mount.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts index.html ./
COPY public ./public
COPY src ./src
RUN npm run build

# Serve: nginx with the built app and the /api proxy (nginx.conf).
# Runs as an unprivileged user (uid 101) on port 8080.
FROM nginxinc/nginx-unprivileged:1.31-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080

# The one healthcheck for every Compose file; probed every 2 s while
# starting so `docker compose up --wait` returns soon after.
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --start-interval=2s --retries=5 \
    CMD wget -q -O- http://127.0.0.1:8080/ >/dev/null 2>&1 || exit 1
