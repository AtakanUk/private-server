# --- Build the React frontend ---
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
ENV REACT_APP_API_URL=""
RUN npm run build

# --- Runtime: API server + static frontend ---
FROM node:22-alpine
WORKDIR /app

# Native build deps for better-sqlite3, ffmpeg for video thumbnails and proxies
RUN apk add --no-cache python3 make g++ ffmpeg

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY backend/ ./
COPY --from=frontend-builder /app/frontend/build ./frontend/build

RUN mkdir -p uploads/originals uploads/thumbnails db logs

EXPOSE 3001
ENV NODE_ENV=production \
    PORT=3001 \
    UPLOAD_DIR=/app/uploads \
    LOG_DIR=/app/logs

VOLUME ["/app/uploads", "/app/db", "/app/logs"]

CMD ["node", "server.js"]
