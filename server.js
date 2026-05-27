// Microservicio para scrapear sitios con anti-bot usando Playwright/Chromium.
// Deploy: Render.com (Docker)
// Auth: header X-API-Key debe coincidir con env SCRAPER_TOKEN.

const express = require("express");
const { chromium } = require("playwright");

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 10000;
const TOKEN = process.env.SCRAPER_TOKEN || "changeme";

// Browser singleton para no relanzar Chromium en cada request.
let browser = null;
let launching = null;

async function getBrowser() {
  if (browser && browser.isConnected()) return browser;
  if (launching) return launching;
  launching = chromium
    .launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-blink-features=AutomationControlled",
        "--single-process",
        "--no-zygote",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-features=IsolateOrigins,site-per-process",
        "--lang=es-AR",
      ],
    })
    .then((b) => {
      browser = b;
      b.on("disconnected", () => {
        console.log("browser disconnected");
        browser = null;
      });
      launching = null;
      return b;
    })
    .catch((err) => {
      console.error("Browser launch failed:", err.message);
      launching = null;
      throw err;
    });
  return launching;
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

  const started = Date.now();
  let ctx = null;
  try {
    const b = await getBrowser();
    ctx = await b.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      locale: "es-AR",
      timezoneId: "America/Argentina/Buenos_Aires",
      extraHTTPHeaders: { "Accept-Language": "es-AR,es;q=0.9" },
      bypassCSP: true,
    });
    // Stealth init script — esconde rastros de Playwright para evadir Datadome y otros anti-bot
    await ctx.addInitScript(() => {
      // Esconder webdriver
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      // Spoof permissions API
      const originalQuery = window.navigator.permissions?.query;
      if (originalQuery) {
        window.navigator.permissions.query = (params) =>
          params.name === "notifications"
            ? Promise.resolve({ state: Notification.permission })
            : originalQuery(params);
      }
      // Spoof chrome runtime
      window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {} };
      // Plugins fake
      Object.defineProperty(navigator, "plugins", {
        get: () => [{ name: "Chrome PDF Plugin" }, { name: "Native Client" }],
      });
      // Languages
      Object.defineProperty(navigator, "languages", { get: () => ["es-AR", "es", "en"] });
      // Hardware concurrency
      Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
      // Device memory
      Object.defineProperty(navigator, "deviceMemory", { get: () => 8 });
    });

    const page = await ctx.newPage();

    // Bloquear solo imágenes/media para ahorrar (no CSS, lo necesita JS para detectar)
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (["image", "media", "font"].includes(type)) return route.abort();
      return route.continue();
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 35000 });
    if (waitFor) {
      try { await page.waitForSelector(waitFor, { timeout: 5000 }); } catch {}
    }
    // Esperar a que se hidrate JS y/o pase el challenge de Datadome
    await page.waitForTimeout(4000);
    // Si todavía dice "Un momento" (Datadome), esperar más
    const earlyTitle = await page.title().catch(() => "");
    if (/un momento|just a moment|please wait/i.test(earlyTitle)) {
      console.log("Detected anti-bot challenge, waiting more...");
      await page.waitForTimeout(6000);
    }

    const html = await page.content();
    const finalUrl = page.url();
    const title = await page.title().catch(() => "");

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
    return res.status(500).json({
      error: e.message,
      took_ms: Date.now() - started,
    });
  } finally {
    if (ctx) {
      try { await ctx.close(); } catch {}
    }
  }
});

app.listen(PORT, () => {
  console.log(`Scraper listening on port ${PORT}`);
});

process.on("SIGTERM", async () => {
  console.log("SIGTERM received, closing browser");
  if (browser) await browser.close().catch(() => {});
  process.exit(0);
});
