# Bare-metal install

Run ClipEngine without Docker on a Linux box, a Raspberry Pi 5, or
inside a VM. This trades the one-line `docker compose up` for direct
control of the Node and FFmpeg installs.

## Prerequisites

- **Node.js 22 LTS**
- **pnpm 9.12** (`npm install -g pnpm@9.12.3`)
- **ffmpeg** + **ffprobe** in `$PATH`
- **yt-dlp** in `$PATH`
- For local Whisper: **cmake**, **g++**, **git**, **python3**

Debian / Ubuntu:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs ffmpeg yt-dlp cmake g++ git python3 pkg-config fonts-dejavu-core
sudo npm install -g pnpm@9.12.3
```

Fedora:

```bash
sudo dnf install -y nodejs:22 ffmpeg yt-dlp cmake gcc-c++ git python3 dejavu-sans-fonts
sudo npm install -g pnpm@9.12.3
```

## Install

```bash
git clone https://github.com/bintangtimurlangit/clipengine.git
cd clipengine
pnpm install --frozen-lockfile
pnpm build
```

## Configure

```bash
cp deploy/.env.example .env
# Edit .env. At minimum, generate a secret:
echo "CLIPENGINE_AUTH_SECRET=$(openssl rand -hex 32)" >> .env
```

## Run

Two processes:

```bash
# Terminal 1: API + worker
pnpm --filter @clipengine/api start

# Terminal 2: Web UI
pnpm --filter @clipengine/web start
```

Or use a process supervisor (`systemd`, `pm2`, `supervisord`). A
minimal `systemd` unit:

```ini
# /etc/systemd/system/clipengine-api.service
[Unit]
Description=ClipEngine API
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/clipengine
EnvironmentFile=/opt/clipengine/.env
ExecStart=/usr/bin/pnpm --filter @clipengine/api start
Restart=on-failure
User=clipengine
Group=clipengine

[Install]
WantedBy=multi-user.target
```

(Replace `User`, `Group`, and `WorkingDirectory` with your install path.)

## Reverse proxy

Run a TLS-terminating proxy in front of the web container so the
browser talks HTTPS. A minimal Caddyfile:

```
clipengine.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

## First run

Open `https://clipengine.example.com` and follow the registration +
onboarding flow.
