# Ephemeral pipeline worker: same deps as the API image, different entrypoint.
# Build from repo root:
#   docker build -f docker/worker.Dockerfile -t clipengine-worker:latest .
FROM python:3.11-slim-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core yt-dlp \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml README.md LICENSE ./
COPY src ./src
RUN pip install --no-cache-dir -e .

COPY apps/api ./apps/api
WORKDIR /app/apps/api
RUN pip install --no-cache-dir -e .

ENV CLIPENGINE_DATA_DIR=/data
ENV CLIPENGINE_WORKSPACE=/workspace

VOLUME ["/data", "/workspace"]

# Default CMD is unused when the API runs `docker run ... python -m clipengine_api.worker <run_id>`
CMD ["python", "-m", "clipengine_api.worker"]
