# Networking

homechronicle needs access to your local network for HomeKit (mDNS) and Matter (IPv6 link-local) device discovery. This page covers how networking works for each deployment method.

## Standalone Docker

The standalone container runs all services internally. Networking only matters for device discovery:

| Mode | Command | Discovery |
|------|---------|-----------|
| **Host network** (recommended) | `--network host -e WEB_PORT=3000` | Full mDNS + Matter support |
| **Bridge** (default) | `-p 3000:80` | No discovery — pair devices manually |

In host mode, PostgreSQL uses a Unix socket internally and will not conflict with a host PostgreSQL installation.

## Docker Compose

### Host Mode (Recommended)

The listener needs host networking for mDNS discovery. This is the default:

```
LISTENER_NETWORK_MODE=host
```

The web container runs in bridge mode and proxies `/api/*` to the listener.

### Bridge Mode Alternative

If you cannot use host networking:

```
LISTENER_NETWORK_MODE=bridge
LISTENER_HOST=listener
```

HomeKit/Matter device discovery may be unreliable in bridge mode.

### Web-to-Listener Routing

The web container proxies API requests to the listener. Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `LISTENER_HOST` | `host.docker.internal` | How the web container reaches the listener |
| `LISTENER_PORT` | Same as `API_PORT` | Listener port for the proxy |

If `host.docker.internal` doesn't resolve (some Linux Docker setups), use your server's LAN IP instead.

### Routing Presets

**Host-network listener (default):**

```
LISTENER_NETWORK_MODE=host
LISTENER_HOST=host.docker.internal
```

**Bridge-network listener:**

```
LISTENER_NETWORK_MODE=bridge
LISTENER_HOST=listener
```

Keep `API_PORT` and `LISTENER_PORT` aligned (default `3001`) or `/api` requests will fail with `502`.

## D-Bus / mDNS

On Linux, the listener container mounts the host's D-Bus socket to communicate with `avahi-daemon` for mDNS discovery:

```
-v /run/dbus/system_bus_socket:/run/dbus/system_bus_socket:ro
```

If avahi is not installed on your host:

```bash
sudo apt install avahi-daemon
sudo systemctl enable --now avahi-daemon
```

## VLANs

Matter requires IPv6 link-local connectivity between the Docker host and your devices. If your IoT devices are on a separate VLAN, you need a VLAN sub-interface on the host. See [limitations.md](https://gitlab.com/havuq/homechronicle/-/blob/main/limitations.md#platform-note-vlan--segregated-iot-networks) for details.
