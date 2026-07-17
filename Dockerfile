# Loom is a static SPA — the document itself never touches the server (see
# src/urlShare.ts), so this image just builds the static assets and serves
# them. No database, no API, no secrets.

FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# npm ci rejects this lockfile in a fresh Linux container — it wants
# @emnapi/core/@emnapi/runtime versions that vary depending on exactly
# which npm resolves a Vite/Rolldown optional platform binary, and pinning
# the npm version didn't make that deterministic either. npm install
# tolerates the drift instead of hard-failing on it.
RUN npm install
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/dist ./dist

# Cloud Run injects PORT at runtime; serve reads it via -l.
ENV PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "serve -s dist -l ${PORT}"]
