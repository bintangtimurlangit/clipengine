# Homelab API: clip-engine (Whisper + deps) + FastAPI. Build from repo root:
#   docker build -f docker/api.Dockerfile .
FROM python:3.11-slim-bookworm

# Client only — used when CLIPENGINE_USE_DOCKER_WORKERS is set and /var/run/docker.sock is mounted.
COPY --from=docker:27-cli /usr/local/bin/docker /usr/local/bin/docker

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

EXPOSE 8000

CMD ["uvicorn", "clipengine_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
