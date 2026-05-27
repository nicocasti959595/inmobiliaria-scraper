// Microservicio para scrapear sitios con anti-bot usando un browser real (Playwright/Chromium).
// Deploy: Render.com (Docker)
// Auth: header X-API-Key debe coincidir con env SCRAPER_TOKEN.

const express = require("express");
const { chromium } = require("playwright");

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 10000;
const TOKEN = process.env.SCRAPER_TOKEN || "changeme";

// Browser singleton para no levantar Chromium en cada request.
let browserPromise = null;
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
      ],
    });
    // Si el browser muere, resetear el singleton
    browserPromise.then((b) => {
      b.on("disconnected", () => {
        browserPromise = null;
      });
    });
  }
  return browserPromise;
}

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "inmobiliaria-scraper", time: new Date().toISOString() });
});

app.get("/healthz", (_req, res) => res.send("ok"));

app.post("/scrape", async (req, res) => {
  const auth = req.get("X-API-Key");
  if (!auth || auth !== TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const { url, waitFor } = req.body || {};
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Falta url" });
  }
  try {
    const browser = await getBrowser();
    const ctx = await browser.newContext({
      viewport: { width: 1366, height: 800 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      locale: "es-AR",
      timezoneId: "America/Argentina/Buenos_Aires",
      extraHTTPHeaders: {
        "Accept-Language": "es-AR,es;q=0.9",
      },
    });
    const page = await ctx.newPage();
    // Bloquear assets no esenciales para acelerar
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (["image", "media", "font"].includes(type)) {
        return route.abort();
      }
      route.continue();
    });

    const started = Date.now();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    if (waitFor) {
      try {
        await page.waitForSelector(waitFor, { timeout: 5000 });
      } catch {}
    }
    // Esperar un poco para que JS llene los datos
    await page.waitForTimeout(1500);
    const html = await page.content();
    const finalUrl = page.url();
    const title = await page.title();
    await ctx.close();

    return res.json({
      ok: true,
      took_ms: Date.now() - started,
      url: finalUrl,
      title,
      html_length: html.length,
      html,
    });
  } catch (e) {
    console.error("scrape error:", e.message);
    return res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Scraper listening on port ${PORT}`);
});
