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
# Base image pin, verified against:
#   @truefoundry/trueforge 0.1.4 / @truefoundry/trueforge-core 0.1.4
#   (npx @truefoundry/trueforge; digest from trueforge-core sandboxImage.json)
# If you upgrade TrueForge, re-derive the digest from its sandboxImage.json,
# bump the versions/checksums below, and rebuild the snapshot
# (FORCE_REBUILD=1 scripts/create-toolchain-snapshot.mjs ...).

FROM tfy.jfrog.io/tfy-images/trueforge-sandbox:0dab475d3d20a8333cff41f25f88e7134c424cf9

ENV DEBIAN_FRONTEND=noninteractive

# System-level tools from Debian.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      nmap \
      sqlmap \
      netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

# projectdiscovery + ffuf static binaries from their GitHub releases, pinned
# and checksum-verified (sha256 of the release archives). Asset names are
# versioned (no unversioned "latest" assets), so these pins must be bumped
# deliberately.
ARG NUCLEI_VERSION=3.11.1
ARG HTTPX_VERSION=1.10.0
ARG FFUF_VERSION=2.2.1
ARG NUCLEI_SHA256=ea63d4ae232808cd7c6bc00d0142428e231fab59dae01042246097d195835ab6
ARG HTTPX_SHA256=63eac4dcd6e5c9867c94765fdaaf66e7b4eeae3474a1f06e600e266a1c81a53e
ARG FFUF_SHA256=86307885810d3c36ba4a3e9ba5178c2d9027bba0dd7f4ea39e39e7c972b62396

RUN set -eux; \
    curl -sSL -o /tmp/nuclei.zip \
      "https://github.com/projectdiscovery/nuclei/releases/download/v${NUCLEI_VERSION}/nuclei_${NUCLEI_VERSION}_linux_amd64.zip"; \
    echo "${NUCLEI_SHA256}  /tmp/nuclei.zip" | sha256sum -c -; \
    unzip -o /tmp/nuclei.zip -d /usr/local/bin nuclei; \
    curl -sSL -o /tmp/httpx.zip \
      "https://github.com/projectdiscovery/httpx/releases/download/v${HTTPX_VERSION}/httpx_${HTTPX_VERSION}_linux_amd64.zip"; \
    echo "${HTTPX_SHA256}  /tmp/httpx.zip" | sha256sum -c -; \
    unzip -o /tmp/httpx.zip -d /usr/local/bin httpx; \
    curl -sSL -o /tmp/ffuf.tgz \
      "https://github.com/ffuf/ffuf/releases/download/v${FFUF_VERSION}/ffuf_${FFUF_VERSION}_linux_amd64.tar.gz"; \
    echo "${FFUF_SHA256}  /tmp/ffuf.tgz" | sha256sum -c -; \
    tar xzf /tmp/ffuf.tgz -C /usr/local/bin ffuf; \
    chmod +x /usr/local/bin/nuclei /usr/local/bin/httpx /usr/local/bin/ffuf; \
    rm -f /tmp/nuclei.zip /tmp/httpx.zip /tmp/ffuf.tgz

# Build-time smoke: fail the snapshot build if any tool is broken.
RUN nuclei -version \
    && httpx -version \
    && ffuf -V \
    && nmap --version | head -n 1 \
    && sqlmap --version
