FROM node:22-slim AS ui
WORKDIR /src/toktagger/ui
COPY toktagger/ui/package.json toktagger/ui/package-lock.json ./
RUN npm ci
COPY toktagger/ui ./
RUN npm run build

FROM python:3.12-slim AS builder
ARG EXTRAS=""
WORKDIR /src
RUN pip install --no-cache-dir uv
ENV UV_LINK_MODE=copy UV_HTTP_TIMEOUT=120
COPY pyproject.toml uv.lock README.md ./
COPY toktagger ./toktagger
COPY --from=ui /src/toktagger/api/static ./toktagger/api/static
RUN UV_PROJECT_ENVIRONMENT=/opt/venv uv sync --frozen --no-dev --no-editable ${EXTRAS:+--extra $EXTRAS}

FROM python:3.12 AS dev
WORKDIR /app
COPY pyproject.toml uv.lock README.md ./
COPY toktagger ./toktagger
RUN pip install --no-cache-dir uv && \
    UV_PROJECT_ENVIRONMENT=/usr/local uv sync --frozen --no-dev --extra models
CMD ["bash"]

FROM python:3.12-slim AS production
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH" \
    SERVER_HOST=0.0.0.0 \
    SERVER_PORT=8002 \
    SERVER_CACHE_DIR=/data \
    SERVER_CORS_ORIGINS="[]"
RUN useradd --create-home --uid 10001 toktagger && \
    mkdir /data && chown toktagger /data
USER toktagger
WORKDIR /data
VOLUME /data
EXPOSE 8002
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8002/health', timeout=4)"]
CMD ["toktagger", "--no-browser"]
