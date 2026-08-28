# Demo Target: OWASP Juice Shop

TrueStrike's demo target is a locally running OWASP Juice Shop instance. This is
the only target used in development, testing, documentation, and demo recordings.

## What is Juice Shop?

[OWASP Juice Shop](https://github.com/juice-shop/juice-shop) is an intentionally
vulnerable web application for security training. It contains dozens of
vulnerabilities spanning the OWASP Top 10, making it ideal for demonstrating
TrueStrike's recon, validation, and reporting pipeline.

## Running the demo target

Prerequisites: Docker installed and running.

```bash
# Pull and run Juice Shop on localhost:3000
docker run -d -p 3000:3000 --name juice-shop bkimminich/juice-shop

# Wait a few seconds for startup, then verify it's reachable
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000
# Expected output: 200
```

The application will be available at http://localhost:3000.

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

If port 3000 is occupied, map to a different port:

```bash
docker run -d -p 3001:3000 --name juice-shop bkimminich/juice-shop
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
(`localhost`, `127.0.0.1`). The Juice Shop demo target fits this constraint.
Never configure TrueStrike to scan external hosts you do not own or have
explicit written permission to test.
