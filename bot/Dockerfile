FROM node:22-bookworm-slim

# Chromium from Debian so the image builds without downloading a browser bundle.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY bot.js ./

ENV NODE_ENV=production CHROME_PATH=/usr/bin/chromium
USER node
CMD ["node", "bot.js"]
