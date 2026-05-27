# Imagen oficial de Playwright (incluye Chromium y todas las dependencias del sistema)
FROM mcr.microsoft.com/playwright:v1.48.0-jammy

WORKDIR /app

# Instalar dependencias
COPY package.json ./
RUN npm install --omit=dev

# Copiar código
COPY server.js ./

# Render asigna el puerto via PORT env var
ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000

CMD ["node", "server.js"]
