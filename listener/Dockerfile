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

# Run as the built-in non-root `node` user (uid 1000).
# The host volume for /app/data must be writable by uid 1000
# (e.g. `chown 1000:1000 /path/to/listener/data` on the host).
RUN chown -R node:node /app

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "const http=require('http');const port=process.env.API_PORT||3001;const req=http.get({host:'127.0.0.1',port,path:'/api/health',timeout:4000},(res)=>process.exit(res.statusCode===200?0:1));req.on('error',()=>process.exit(1));req.on('timeout',()=>{req.destroy();process.exit(1)});"

CMD ["node", "src/index.js"]
