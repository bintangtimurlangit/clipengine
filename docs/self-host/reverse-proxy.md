# Reverse proxy + TLS

ClipEngine ships plain HTTP. Always run a TLS-terminating reverse
proxy in front of it.

## Caddy

```Caddyfile
clipengine.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

That's the whole config. Caddy fetches and renews a Let's Encrypt
certificate on its own.

## nginx

```nginx
server {
    listen 443 ssl http2;
    server_name clipengine.example.com;

    ssl_certificate     /etc/letsencrypt/live/clipengine.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/clipengine.example.com/privkey.pem;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";

        # Run streams use Server-Sent Events; disable buffering and
        # use a long read timeout.
        proxy_read_timeout 24h;
        proxy_buffering    off;
    }
}

server {
    listen 80;
    server_name clipengine.example.com;
    return 301 https://$host$request_uri;
}
```

## Traefik (compose label)

In `deploy/compose.yaml`, add labels to the `web` service:

```yaml
web:
  # ...existing config...
  labels:
    - "traefik.enable=true"
    - "traefik.http.routers.clipengine.rule=Host(`clipengine.example.com`)"
    - "traefik.http.routers.clipengine.entrypoints=websecure"
    - "traefik.http.routers.clipengine.tls.certresolver=letsencrypt"
    - "traefik.http.services.clipengine.loadbalancer.server.port=3000"
```

## Cloudflare Tunnel

If the host is behind NAT, use [Cloudflare
Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
to expose the web container without opening any ports:

```yaml
# /etc/cloudflared/config.yml
tunnel: <tunnel-id>
credentials-file: /etc/cloudflared/<tunnel-id>.json

ingress:
  - hostname: clipengine.example.com
    service: http://localhost:3000
  - service: http_status:404
```

Cloudflare's edge handles TLS; the tunnel handles inbound. SSE works
through Cloudflare on the default plan.

## Required headers

Whatever proxy you pick, make sure it forwards:

- `Host`
- `X-Forwarded-Proto`
- `X-Forwarded-For`

Better Auth uses these to set the session cookie's secure flag and
domain correctly.

## SSE caveats

The run detail page subscribes to `GET /api/runs/:id/stream`, which is
a long-lived SSE connection. Make sure the proxy:

- Disables response buffering (`proxy_buffering off` for nginx).
- Sets a long `proxy_read_timeout` (24h is fine).
- Doesn't strip `Cache-Control: no-cache` headers.

Cloudflare and Caddy do the right thing by default. nginx needs the
`proxy_buffering off` line.
