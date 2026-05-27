# Scraper Service (Playwright)

Microservicio Express + Playwright para scrapear sitios protegidos por anti-bot
(MercadoLibre, Zonaprop, etc.) desde el panel admin de la inmobiliaria.

## Deploy en Render (free tier)

1. Push este folder (`scraper-service/`) a un repo de GitHub.
2. En https://dashboard.render.com → **New +** → **Web Service**.
3. Conectar el repo de GitHub.
4. Render detecta el `render.yaml` y autoconfigura.
5. Al primer deploy genera el `SCRAPER_TOKEN` (verlo en Environment).
6. Pasar la URL pública del servicio + el token al frontend (Vercel env var).

## Endpoint

```
POST /scrape
Headers:
  X-API-Key: <SCRAPER_TOKEN>
  Content-Type: application/json

Body:
  { "url": "https://...", "waitFor": "selector-css-opcional" }

Response (200):
  {
    "ok": true,
    "took_ms": 5234,
    "url": "...",
    "title": "...",
    "html_length": 123456,
    "html": "<!DOCTYPE html>..."
  }
```

## Limitaciones del free tier de Render

- Después de 15 min de idle, el servicio se duerme.
- Primera request post-sleep tarda 30-60s (cold start).
- 750 hs/mes gratis (suficiente para uso esporádico).
