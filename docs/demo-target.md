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

TrueStrike's agent executes its tooling inside a Daytona cloud sandbox. A cloud
sandbox cannot reach services bound to your machine's loopback interface, so
`http://localhost:3000` is only reachable from the CLI process, not from the
agent's tools. For live scans, expose the local target through a tunnel and
authorize the tunnel hostname explicitly:

```bash
# one-off quick tunnel, no account required (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-quick-tunnels/)
cloudflared tunnel --url http://localhost:3000
# prints something like: https://<random-words>.trycloudflare.com

# authorize that exact hostname for the scan (comma-separated list)
TRUESTRIKE_ALLOW_HOSTS=<random-words>.trycloudflare.com \
  pnpm truestrike scan https://<random-words>.trycloudflare.com
```

Security notes for this setup:

- The tunnel URL is random and short-lived; tear the tunnel down when done.
- The tunnel is reachable from the public internet while it runs. Juice Shop
  is an intentionally vulnerable app with no real data, but do not leave the
  tunnel running unattended, and never tunnel a real application this way.
- Only ever add tunnel hostnames you created yourself to
  `TRUESTRIKE_ALLOW_HOSTS`.

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
when using a tunnel (see above), its hostname must be added explicitly via
`TRUESTRIKE_ALLOW_HOSTS`. Never configure TrueStrike to scan external hosts
you do not own or have explicit written permission to test.
