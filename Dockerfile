# Loom is a static SPA — the document itself never touches the server (see
# src/urlShare.ts), so this image just builds the static assets and serves
# them. No database, no API, no secrets.

FROM node:20-slim AS build
WORKDIR /app
# Match the npm version the lockfile was generated with — npm 10 (bundled
# with node:20) and npm 11 resolve optional platform-specific binaries
# (e.g. @rolldown/binding-*) differently, which makes `npm ci` reject an
# otherwise-valid lockfile as "out of sync".
RUN npm install -g npm@11
COPY package.json package-lock.json ./
RUN npm ci
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
