# --- stage 1: build the Angular portal (Siemens Element 49.16.0) --------------
FROM node:22-bookworm-slim AS frontend

WORKDIR /build
COPY frontend/package.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# Inventory of the OSS packages that ship in the browser bundle. Served by the
# About page (si-about, license API mode).
COPY tools/ /tools/
RUN node /tools/collect-licenses.js /build /build/licenses-frontend.json frontend

# --- stage 2: runtime --------------------------------------------------------
FROM node:22-bookworm-slim

WORKDIR /app
COPY server/package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY tools/ /tools/
RUN node /tools/collect-licenses.js /app /app/licenses-backend.json backend
COPY server/index.js ./
COPY --from=frontend /build/dist/browser ./public
COPY --from=frontend /build/licenses-frontend.json ./licenses-frontend.json

ENV NODE_ENV=production PORT=3000
EXPOSE 3000
USER node
CMD ["node", "index.js"]
