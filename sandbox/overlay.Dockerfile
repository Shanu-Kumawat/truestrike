# TrueStrike security toolchain overlay.
#
# Extends the official TrueForge sandbox image (python:3.13-slim-bookworm +
# supervisor + NATS code-mode bridge) with the pentest toolchain the agent
# drives during scans. Daytona builds this Dockerfile server-side
# (Image.fromDockerfile), so no local Docker build or registry push is needed.
#
# The snapshot name must be `trueforge-build-<digest-of-the-pinned-image>` so
# TrueForge's Daytona provider adopts it by name (see TS-11): the provider
# derives that name from the release image digest in sandboxImage.json and
# treats an existing snapshot with that name as its own build.
#
# Pin the FROM digest to the trueforge release you run (`npx @truefoundry/trueforge`).
# If you upgrade TrueForge, re-derive the digest from its sandboxImage.json and
# rebuild this snapshot.

FROM tfy.jfrog.io/tfy-images/trueforge-sandbox:0dab475d3d20a8333cff41f25f88e7134c424cf9

ENV DEBIAN_FRONTEND=noninteractive

# System-level tools from Debian.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      nmap \
      sqlmap \
      netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

# projectdiscovery + ffuf static binaries from their GitHub releases, pinned.
# Asset names are versioned (no unversioned "latest" assets), so these pins
# must be bumped deliberately.
ARG NUCLEI_VERSION=3.11.1
ARG HTTPX_VERSION=1.10.0
ARG FFUF_VERSION=2.2.1

RUN set -eux; \
    curl -sSL -o /tmp/nuclei.zip \
      "https://github.com/projectdiscovery/nuclei/releases/download/v${NUCLEI_VERSION}/nuclei_${NUCLEI_VERSION}_linux_amd64.zip"; \
    unzip -o /tmp/nuclei.zip -d /usr/local/bin nuclei; \
    curl -sSL -o /tmp/httpx.zip \
      "https://github.com/projectdiscovery/httpx/releases/download/v${HTTPX_VERSION}/httpx_${HTTPX_VERSION}_linux_amd64.zip"; \
    unzip -o /tmp/httpx.zip -d /usr/local/bin httpx; \
    curl -sSL \
      "https://github.com/ffuf/ffuf/releases/download/v${FFUF_VERSION}/ffuf_${FFUF_VERSION}_linux_amd64.tar.gz" \
      | tar xz -C /usr/local/bin ffuf; \
    chmod +x /usr/local/bin/nuclei /usr/local/bin/httpx /usr/local/bin/ffuf; \
    rm -f /tmp/nuclei.zip /tmp/httpx.zip

# Build-time smoke: fail the snapshot build if any tool is broken.
RUN nuclei -version \
    && httpx -version \
    && ffuf -V \
    && nmap --version | head -n 1 \
    && sqlmap --version
