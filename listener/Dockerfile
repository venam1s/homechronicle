# --- Stage 1: install dependencies (needs build tools for native addons) -----
FROM node:22-trixie-slim AS build

# Build tools for native addons (e.g. @stoprocent/noble via matter.js)
# mDNS/BLE headers needed at compile time
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    libavahi-compat-libdnssd-dev \
    libbluetooth-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json .
RUN npm install --omit=dev

# --- Stage 2: runtime image (no build tools) ---------------------------------
FROM node:22-trixie-slim

# Runtime shared libs (no -dev headers), dbus client for host avahi,
# and common troubleshooting tools.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libavahi-compat-libdnssd1 dbus \
    libbluetooth3 \
    dnsutils iputils-ping curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY package.json .
COPY src/ ./src/

# Pairing keys and persistent data are volume-mounted at /app/data
RUN mkdir -p /app/data

# Run as non-root. The host volume for /app/data must be writable by uid 1000
# (e.g. `chown 1000:1000 /path/to/listener/data` on the host).
RUN groupadd -g 1000 appuser && \
    useradd -u 1000 -g appuser -s /bin/sh appuser && \
    chown -R appuser:appuser /app

USER appuser

CMD ["node", "src/index.js"]
