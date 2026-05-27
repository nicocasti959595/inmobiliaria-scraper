# Imagen oficial de Playwright (incluye Chromium y dependencias del sistema)
FROM mcr.microsoft.com/playwright:v1.48.0-jammy

WORKDIR /app

# Usar el chromium del propio image (no redescargar)
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV NODE_OPTIONS="--max-old-space-size=400"

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./

ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000

CMD ["node", "server.js"]
