# syntax=docker/dockerfile:1

##
## ---- Build stage -----------------------------------------------------
## Installs full dependencies, compiles TypeScript sources (src -> build)
## and builds native addons (e.g. better-sqlite3) against the target image.
##
FROM node:22-bookworm-slim AS builder

# Native modules (better-sqlite3, etc.) need a toolchain to build/install.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run dist

# Keep only production dependencies for the runtime image.
RUN npm prune --omit=dev

##
## ---- Runtime stage -----------------------------------------------------
##
FROM node:22-bookworm-slim AS runtime

WORKDIR /app

# The app resolves config.ini / downloaded server binaries relative to
# `process.execPath` (see src/helper.js -> getFile()). Copying the node
# binary into /app and invoking it from there keeps that path pinned to
# /app instead of the system node install location, so a volume mounted
# at /app persists config.ini and downloaded binaries correctly.
RUN cp "$(command -v node)" /app/node

COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY assets ./assets

RUN mkdir -p /app/pkg /app/bin

# The server auto-detects its own address per-request from the client's
# HTTP Host header (see server.getRequestBaseURI()), so CDN_HOST does NOT
# need to be set for typical `docker run -p` usage. Only set CDN_HOST if
# you need to force a specific address/domain (e.g. behind a reverse proxy
# or a different public port than the container's). CDN_PORT/CDN_BASE_PATH
# have sane container defaults below but can be overridden at `docker run`.
# These env vars let `start` run unattended, without the interactive setup
# menu, and are merged over/into config.ini (see src/helper.js).
ENV CDN_PORT=6449
ENV CDN_BASE_PATH=/app/pkg

# Default port used by the interactive setup (configurable via config.ini).
EXPOSE 6449

VOLUME ["/app/bin", "/app/pkg"]

ENTRYPOINT ["/app/node", "build/app.js"]
CMD ["start"]
