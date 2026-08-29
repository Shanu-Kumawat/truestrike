# Demo Target: OWASP Juice Shop

TrueStrike's demo target is a locally running OWASP Juice Shop instance. This is
the only target used in development, testing, documentation, and demo recordings.

## What is Juice Shop?

[OWASP Juice Shop](https://github.com/juice-shop/juice-shop) is an intentionally
vulnerable web application for security training. It contains dozens of
vulnerabilities spanning the OWASP Top 10, making it ideal for demonstrating
TrueStrike's recon, validation, and reporting pipeline.

## Running the demo target

Prerequisites: Docker installed and running. A helper script handles pull,
start, health check, and lifecycle:

```bash
scripts/demo-target.sh start    # pull + run + wait until reachable
scripts/demo-target.sh status   # container + http status
scripts/demo-target.sh stop     # stop (keeps the container)
scripts/demo-target.sh restart
scripts/demo-target.sh remove   # delete the container
```

Or with plain Docker:

```bash
# Pull and run Juice Shop on localhost:3000
docker run -d -p 3000:3000 --name juice-shop bkimminich/juice-shop

# Wait a few seconds for startup, then verify it's reachable
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000
# Expected output: 200
```

The application will be available at http://localhost:3000.

## Making the target reachable from the sandbox

TrueStrike's agent executes its tooling inside a Daytona cloud sandbox, and the
sandbox's egress is restricted to an allowlist of essential services (package
registries, GitHub, and CDN endpoints including `*.workers.dev`). Two
consequences for the demo target:

1. The sandbox cannot reach services bound to your machine's loopback, so
   `http://localhost:3000` is only reachable from the CLI process.
2. Plain quick tunnels (`*.trycloudflare.com`) are NOT on the allowlist.

The demo therefore runs the target through a two-hop Cloudflare relay:

```
sandbox -> https://<name>.<account>.workers.dev (allowlisted CDN)
        -> Cloudflare edge -> trycloudflare quick tunnel -> localhost:3000
```

Setup:

```bash
# 1. quick tunnel to the local Juice Shop
cloudflared tunnel --url http://localhost:3000
# prints: https://<random-words>.trycloudflare.com

# 2. deploy the relay worker (worker/ in this repo; wrangler logged in)
cd worker
npx wrangler deploy

# 3. point the worker at the tunnel (redo whenever the tunnel restarts
#    with a new URL - no redeploy needed)
echo "https://<random-words>.trycloudflare.com" | npx wrangler secret put TUNNEL_URL

# 4. authorize the worker hostname and scan
TRUESTRIKE_ALLOW_HOSTS=<name>.<account>.workers.dev \
  pnpm truestrike scan https://<name>.<account>.workers.dev
```

Security notes for this setup:

- Both hops are Cloudflare-owned infrastructure; the tunnel URL is random and
  the worker URL is under your account. Tear the tunnel down when done.
- The relay is reachable from the public internet while it runs. Juice Shop is
  an intentionally vulnerable app with no real data, but do not leave the
  relay running unattended, and never relay a real application this way.
- Only ever add hostnames you created yourself to `TRUESTRIKE_ALLOW_HOSTS`.

## Management commands

```bash
# Check if the container is running
docker ps --filter name=juice-shop

# Stop the container (preserves data)
docker stop juice-shop

# Start an existing stopped container
docker start juice-shop

# Remove the container completely
docker rm -f juice-shop
```

## Troubleshooting

### Port 3000 already in use

If port 3000 is occupied, set a different port for the helper script:

```bash
JUICE_SHOP_PORT=3001 scripts/demo-target.sh start
```

Then scan with `pnpm truestrike scan http://localhost:3001`.

### Container fails to start

Check Docker logs:

```bash
docker logs juice-shop
```

Juice Shop typically needs 5-10 seconds to initialize. If health checks fail,
wait longer and retry.

## Scope constraint

TrueStrike's scope allowlist defaults to loopback addresses only
(`localhost`, `127.0.0.1`). The Juice Shop demo target fits this constraint;
when using the relay (see above), its hostname must be added explicitly via
`TRUESTRIKE_ALLOW_HOSTS`. Never configure TrueStrike to scan external hosts
you do not own or have explicit written permission to test.
