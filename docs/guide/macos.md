# macOS Installation

On a Mac, run the **listener directly on macOS with Node.js** and keep only PostgreSQL and the web UI in Docker. The all-in-Docker setups ([Docker Compose](docker-compose.md), [Standalone](standalone.md)) start under Docker Desktop but can't find or pair HomeKit accessories.

This page was written for an Apple Silicon Mac (M1 or later) left running at home, such as a Mac mini. On an Intel Mac, Homebrew lives in `/usr/local` instead of `/opt/homebrew`; the commands below that use `which node` pick up the right path either way.

## Why not just Docker?

HomeKit accessories announce themselves on your network with mDNS (Bonjour), and HomeChronicle pairs a HomeKit accessory at the address that announcement gives it. On Linux, the listener container uses host networking and sees those announcements directly.

Docker Desktop on macOS runs containers inside a Linux virtual machine. Its host-networking option works at the TCP/UDP layer only, and the container has no access to the Mac's network interfaces, so the mDNS traffic HomeChronicle relies on doesn't reach it. The scan in **Devices › Add Accessories** comes back empty and there is nothing to pair. Matter discovery needs IPv6 link-local access to the network and is affected the same way.

Run on the Mac itself, the listener uses the Mac's own network interface, and discovery works as it does on Linux.

## What you need

- A Mac on the same network as your accessories, preferably on Ethernet
- **Docker Desktop** (or another Docker runtime such as OrbStack) for PostgreSQL and the web UI
- **Node.js 22** for the listener
- **Git**, to download HomeChronicle (`git --version` offers to install it if it's missing)
- HomeKit accessory setup codes (8 digits, `111-22-333`)

Install Node.js 22 with [Homebrew](https://brew.sh):

```bash
brew install node@22
echo 'export PATH="/opt/homebrew/opt/node@22/bin:$PATH"' >> ~/.zprofile
source ~/.zprofile
node --version   # v22.x
which node       # note this path, you'll need it later
```

The installer from [nodejs.org](https://nodejs.org) works too; pick the 22.x LTS release. Use Node 22 rather than the newest Node, which is the version the Docker image runs. The listener's native modules ship prebuilt for Apple Silicon, so you shouldn't need a compiler. If `npm` asks for one, run `xcode-select --install`.

> **Install outside Documents, Desktop, Downloads and iCloud Drive.** macOS privacy protections stop background services from reading those folders, and the listener would fail at startup with `Operation not permitted`. The commands below use `~/homechronicle`.

> **Tried the Docker-only setup before?** Remove that listener container first so it doesn't hold port 3001: `docker compose rm -sf listener` in the old folder.

## Install

### 1. Download HomeChronicle

```bash
cd ~
git clone https://gitlab.com/havuq/homechronicle.git
cd homechronicle

# Use the latest release rather than the development branch
git checkout $(git tag --list 'v*' --sort=-v:refname | grep -v -- -beta | head -1)
git describe --tags   # shows the version you're on, e.g. v0.4.3

cd listener
npm ci --omit=dev
cd ..
```

### 2. Find your network interface

```bash
route -n get default | grep interface
```

This prints something like `interface: en0`. On a Mac mini, `en0` is usually Ethernet and `en1` Wi-Fi, but use whatever this command shows.

Check that the Mac can see your accessories before going further:

```bash
cd listener
DISCOVER_IFACE=en0 node src/discover.js
cd ..
```

After 10 seconds it lists the HomeKit accessories it found, with their names and addresses. If it finds nothing here, the rest of the setup won't either; see [Troubleshooting](#troubleshooting) below.

### 3. Configure `.env`

```bash
cp .env.example .env
openssl rand -hex 32   # API token
openssl rand -hex 16   # database password
```

Open `.env` in a text editor and set:

| Variable | Set to |
|----------|--------|
| `API_TOKEN` | the first generated value |
| `POSTGRES_PASSWORD` | the second generated value |
| `TZ` | your time zone, e.g. `America/New_York` |

Then add these lines at the end. They tell the listener, which now runs outside Docker, where things are:

```bash
# --- macOS: the listener runs on the Mac, not in Docker ---
DATABASE_URL=postgresql://homekit:<POSTGRES_PASSWORD>@127.0.0.1:5432/homekit_events
TRUST_PROXY=1
DISCOVER_IFACE=en0
WEB_IMAGE=havuq/homechronicle-web:0.4.3
```

- Replace `<POSTGRES_PASSWORD>` with the same password you set above. If you changed `POSTGRES_USER` or `POSTGRES_DB`, change them in the URL too.
- `TRUST_PROXY=1` tells the listener that requests arrive through the web container, so sign-in rate limits apply per visitor instead of to everyone at once.
- Set `DISCOVER_IFACE` to the interface from step 2.
- Set `WEB_IMAGE` to the version you checked out in step 1, without the `v`. The web UI and listener should always be on the same version.

Don't add `NODE_ENV=production`. In the Docker image that setting points the listener's data at `/app/data`, which doesn't exist on a Mac. Left unset, the listener still runs in production mode and keeps its data in `listener/data`.

### 4. Start PostgreSQL and the web UI

Make sure Docker Desktop is running, then:

```bash
docker compose up -d postgres web
```

Always name the two services. A plain `docker compose up -d` would also start the Docker listener.

### 5. Start the listener

```bash
cd listener
npm start
```

Watch for these lines:

```
[db] Schema ready.
[api] Listening on 0.0.0.0:3001
[discovery] Scan complete — found N accessory/accessories
```

Open `http://localhost:3000` (or `http://<mac-ip>:3000` from another device). On the first visit you create the admin account; see [Accounts & Users](accounts.md). Then pair accessories from **Devices › Add Accessories**; see [Device Setup](devices.md).

Running `npm start` in Terminal is fine for trying it out, but the listener stops when you close the window. The next section starts it automatically.

## Run the listener at startup

Press `Ctrl+C` to stop the listener you started by hand, then install it as a **LaunchDaemon**, which macOS starts at boot and restarts if it exits.

> **Use a LaunchDaemon, not a LaunchAgent.** macOS's Local Network privacy lets launchd daemons reach the local network without asking ([Apple TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)). A per-user LaunchAgent is subject to it: mDNS traffic is blocked with `EHOSTUNREACH`, so scans find nothing, and versions up to v0.4.4-beta.2 exit on that error before macOS gets a chance to ask for permission.

Create the file `/Library/LaunchDaemons/net.homechronicle.listener.plist`:

```bash
sudo nano /Library/LaunchDaemons/net.homechronicle.listener.plist
```

Paste this, replacing `YOUR_USERNAME` (run `whoami`) in all four places and the Node path with the output of `which node`. The path shown is Homebrew's on Apple Silicon.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>net.homechronicle.listener</string>
  <key>UserName</key>
  <string>YOUR_USERNAME</string>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/opt/node@22/bin/node</string>
    <string>--env-file=../.env</string>
    <string>src/index.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Users/YOUR_USERNAME/homechronicle/listener</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/Users/YOUR_USERNAME/homechronicle/listener.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/YOUR_USERNAME/homechronicle/listener.log</string>
</dict>
</plist>
```

`UserName` makes the listener run as you rather than as root, so its files in `listener/data` stay yours. Load it:

```bash
sudo chown root:wheel /Library/LaunchDaemons/net.homechronicle.listener.plist
sudo chmod 644 /Library/LaunchDaemons/net.homechronicle.listener.plist
sudo launchctl bootstrap system /Library/LaunchDaemons/net.homechronicle.listener.plist
tail -f ~/homechronicle/listener.log
```

You should see the same startup lines as before. Useful commands:

| Task | Command |
|------|---------|
| Restart the listener | `sudo launchctl kickstart -k system/net.homechronicle.listener` |
| Stop it until the next boot | `sudo launchctl bootout system/net.homechronicle.listener` |
| Start it again | `sudo launchctl bootstrap system /Library/LaunchDaemons/net.homechronicle.listener.plist` |
| Check it's running | `sudo launchctl print system/net.homechronicle.listener \| grep state` |
| Remove it | stop it, then `sudo rm /Library/LaunchDaemons/net.homechronicle.listener.plist` |

### Keep the Mac awake and running

A Mac that sleeps stops recording events. In **System Settings**:

- **Energy**: turn on **Prevent automatic sleeping when the display is off** and **Start up automatically after a power failure**.
- **Docker Desktop › Settings › General**: turn on **Start Docker Desktop when you sign in to your computer**.
- **Users & Groups › Automatically log in as**: choose your account. Docker Desktop only starts after someone signs in, so without this PostgreSQL and the web UI stay down after a restart until you log in. Automatic login isn't available with FileVault turned on.

The listener starts at boot whether or not anyone signs in. Until PostgreSQL is up, it exits and launchd retries it about every 10 seconds, so it connects as soon as Docker Desktop has started.

## Updating

```bash
cd ~/homechronicle
git fetch --tags
git checkout v0.4.4          # the new release
cd listener && npm ci --omit=dev && cd ..
```

Change `WEB_IMAGE` in `.env` to the same version (`havuq/homechronicle-web:0.4.4`), then:

```bash
docker compose up -d postgres web
sudo launchctl kickstart -k system/net.homechronicle.listener
```

The database schema migrates automatically when the listener starts. Check [Upgrading](upgrading.md) for release-specific notes.

## Matter

The Matter controller runs on the same interface as HomeKit discovery (`DISCOVER_IFACE`). Bluetooth commissioning isn't available in this setup (the log says `BLE is not enabled on this platform`), so add Matter devices that are already on your network, using a pairing code from Apple Home's **Turn On Pairing Mode**. See [Device Setup](devices.md).

## Troubleshooting

**`discover.js` finds nothing**
Check the interface with `route -n get default | grep interface` and try again with that name. A VPN can take over the default route; disconnect it or set `DISCOVER_IFACE` to the physical interface. The Mac and the accessories must be on the same network segment (see [Networking](networking.md#vlans)). To see whether the Mac itself sees HomeKit announcements, run `dns-sd -B _hap._tcp` and press `Ctrl+C` after a few seconds.

**`discover.js` stops with `send EHOSTUNREACH 224.0.0.251:5353`**
Local Network privacy blocked the scan (older versions print a stack trace, newer ones `Scan failed:`). This happens when you run it from another app's built-in terminal, such as VS Code's. Run it from Terminal or over SSH instead.

**Discovery works in Terminal but not when started automatically**
Local Network privacy is blocking the listener. The log shows `send EHOSTUNREACH 224.0.0.251:5353`, followed by `[discovery] Scan skipped` or, on versions up to v0.4.4-beta.2, the listener restarting over and over. Run it as the LaunchDaemon above, not as a LaunchAgent. The same applies to starting it from another app's built-in terminal, such as VS Code's: Apple's exemption covers Terminal itself, not other apps.

**The web UI shows `502 Bad Gateway`**
The web container can't reach the listener. Check that it's running with `curl http://localhost:3001/api/health` (it should print `{"status":"ok"…}`). If `API_PORT` isn't `3001`, set `LISTENER_PORT` to the same value and run `docker compose up -d web`.

**The listener exits with `ECONNREFUSED 127.0.0.1:5432`**
PostgreSQL isn't running. Start Docker Desktop and run `docker compose up -d postgres web`. If something else on the Mac already uses port 5432 (Homebrew PostgreSQL, Postgres.app), set `POSTGRES_PORT=5433` in `.env`, change the port in `DATABASE_URL` to match, and start the containers again.

**The listener fails with `password authentication failed`**
The password in `DATABASE_URL` doesn't match `POSTGRES_PASSWORD`. PostgreSQL only reads `POSTGRES_PASSWORD` when it first creates its database, so changing it later has no effect. Put the original password back in both, or remove the database volume and start over (this deletes all events): `docker compose down -v`.

**Errors mentioning `/app/data`**
`NODE_ENV=production` is set in `.env` or in the shell. Remove it.

For pairing errors and everything else, see the main [Troubleshooting](troubleshooting.md) page.
