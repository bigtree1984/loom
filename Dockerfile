# Loom is a static SPA — the document itself never touches the server (see
# src/urlShare.ts), so this image just builds the static assets and serves
# them. No database, no API, no secrets.

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/dist ./dist

# Cloud Run injects PORT at runtime; serve reads it via -l.
ENV PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "serve -s dist -l ${PORT}"]
