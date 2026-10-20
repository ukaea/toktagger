#!/usr/bin/env bash
# Build the JOSS paper (paper.pdf) with the openjournals/inara Docker image.
# Usage: ./build.sh [--jats]
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

FORMATS="pdf"
[[ "${1:-}" == "--jats" ]] && FORMATS="pdf,jats"

# The image is amd64 only. On Apple Silicon it runs under emulation,
# and the pandoc "Ticker: poll failed" error can happen at random.
# Set the platform explicitly and retry a few times.
MAX_TRIES=3
for ((try = 1; try <= MAX_TRIES; try++)); do
    if docker run --rm \
        --platform linux/amd64 \
        --volume "$PWD":/data \
        --user "$(id -u):$(id -g)" \
        --env JOURNAL=joss \
        --env GHCRTS=-V0 \
        openjournals/inara -o "$FORMATS" paper.md; then
        echo "Built: $PWD/paper.pdf"
        exit 0
    fi
    echo "Build failed (attempt $try/$MAX_TRIES)." >&2
done
exit 1
