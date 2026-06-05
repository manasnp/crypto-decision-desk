import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const authUser = process.env.CRYPTO_USER || "trader";
const authPassword = process.env.CRYPTO_PASSWORD || "";
const requireAuth = Boolean(authPassword) || process.env.NODE_ENV === "production";

if (requireAuth && !authPassword) {
  throw new Error("Set CRYPTO_PASSWORD before running in production.");
}

const symbols = {
  XRP: { id: "ripple", query: "XRP OR Ripple" },
  BTC: { id: "bitcoin", query: "Bitcoin OR BTC" },
  ETH: { id: "ethereum", query: "Ethereum OR ETH" },
  SOL: { id: "solana", query: "Solana OR SOL" },
  ADA: { id: "cardano", query: "Cardano OR ADA" }
};

const rssFeeds = [
  "https://www.coindesk.com/arc/outboundfeeds/rss/",
  "https://cointelegraph.com/rss",
  "https://decrypt.co/feed",
  "https://cryptoslate.com/feed/"
];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const cache = new Map();

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(body));
}

function sendText(res, status, body) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(body);
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isAuthorized(req) {
  if (!requireAuth) return true;

  const header = req.headers.authorization || "";
  if (!header.startsWith("Basic ")) return false;

  const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator === -1) return false;

  const user = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);
  return safeEqual(user, authUser) && safeEqual(password, authPassword);
}

function requestAuth(res) {
  res.writeHead(401, {
    "www-authenticate": 'Basic realm="Crypto Decision Desk", charset="UTF-8"',
    "content-type": "text/plain; charset=utf-8"
  });
  res.end("Authentication required");
}

async function cached(key, ttlMs, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await loader();
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function fetchJson(url, ttlMs = 45_000) {
  return cached(url, ttlMs, async () => {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "CryptoDecisionDesk/1.0"
      }
    });
    if (!response.ok) throw new Error(`${response.status} from ${url}`);
    return response.json();
  });
}

async function fetchText(url, ttlMs = 180_000) {
  return cached(url, ttlMs, async () => {
    const response = await fetch(url, {
      headers: {
        accept: "application/rss+xml,text/xml,text/html",
        "user-agent": "CryptoDecisionDesk/1.0"
      }
    });
    if (!response.ok) throw new Error(`${response.status} from ${url}`);
    return response.text();
  });
}

function stripCdata(value = "") {
  return value
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function parseRss(xml, sourceUrl) {
  return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].slice(0, 20).map((match) => {
    const item = match[0];
    const pick = (tag) => {
      const found = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
      return stripCdata(found?.[1] || "");
    };
    return {
      title: pick("title"),
      link: pick("link"),
      publishedAt: new Date(pick("pubDate") || pick("dc:date") || Date.now()).toISOString(),
      source: new URL(sourceUrl).hostname.replace(/^www\./, ""),
      summary: stripCdata(pick("description")).slice(0, 260)
    };
  }).filter((item) => item.title && item.link);
}

function keywordScore(text) {
  const lower = text.toLowerCase();
  const positive = ["approval", "approved", "partnership", "adoption", "inflows", "breakout", "rally", "surge", "settlement", "launch", "license", "etf"];
  const negative = ["hack", "lawsuit", "sec", "outflows", "ban", "crackdown", "liquidation", "exploit", "selloff", "probe", "delay", "rejection"];
  return positive.reduce((sum, word) => sum + Number(lower.includes(word)), 0)
    - negative.reduce((sum, word) => sum + Number(lower.includes(word)), 0);
}

function driversFor(asset, articles, market) {
  const corpus = articles.map((article) => `${article.title} ${article.summary}`).join(" ").toLowerCase();
  const drivers = [];
  const add = (when, label, detail, tone = "neutral") => {
    if (when) drivers.push({ label, detail, tone });
  };

  add(corpus.includes("sec") || corpus.includes("lawsuit") || corpus.includes("ripple"),
    "Regulatory headlines", `${asset === "XRP" ? "XRP" : asset} is sensitive to legal, exchange, and ETF-related news.`, "risk");
  add(corpus.includes("whale") || corpus.includes("transfer") || corpus.includes("exchange"),
    "Large-holder movement", "Whale transfers and exchange inflows can change short-term liquidity.", "risk");
  add(corpus.includes("fed") || corpus.includes("rates") || corpus.includes("dollar") || corpus.includes("inflation"),
    "Macro pressure", "Rates, dollar strength, and risk appetite often steer crypto beta.", "neutral");
  add(corpus.includes("etf") || corpus.includes("inflows"),
    "Fund flows", "ETF and fund-flow stories can pull broad crypto sentiment higher or lower.", "opportunity");
  add(Math.abs(market.change24h || 0) > 4,
    "Fast price move", `${asset} moved ${market.change24h?.toFixed(2)}% in 24h; position sizing matters.`, market.change24h > 0 ? "opportunity" : "risk");
  add((market.volumeChange24h || 0) > 20,
    "Volume expansion", "Rising volume makes the current move more meaningful than a thin drift.", "opportunity");

  if (!drivers.length) {
    drivers.push({
      label: "No single dominant catalyst",
      detail: "Current movement looks more market-wide than story-specific from the available feeds.",
      tone: "neutral"
    });
  }
  return drivers.slice(0, 5);
}

function decisionLens(asset, articles, market) {
  const newsScore = articles.reduce((sum, article) => sum + keywordScore(`${article.title} ${article.summary}`), 0);
  const change = market.change24h || 0;
  const volume = market.volumeChange24h || 0;
  const momentum = Math.sign(change) + Math.sign(volume) + Math.sign(newsScore);
  const volatility = Math.abs(change);

  let stance = "Wait";
  let setup = "No high-conviction setup";
  let reason = "Mixed signals. Let price confirm direction before adding risk.";

  if (momentum >= 2 && volatility < 12) {
    stance = "Watch long";
    setup = "Momentum continuation";
    reason = "Price, volume, and/or headlines are leaning positive without extreme 24h movement.";
  } else if (momentum <= -2) {
    stance = "Defensive";
    setup = "Avoid fresh longs";
    reason = "Recent movement and headlines lean risk-off; consider waiting for stabilization.";
  } else if (volatility >= 12) {
    stance = "High risk";
    setup = "Reduce size or wait";
    reason = "The 24h move is stretched enough that entries can get punished quickly.";
  }

  const invalidation = change >= 0
    ? "Bullish idea weakens if price loses the prior intraday support area on rising volume."
    : "Bearish pressure eases if price reclaims the prior intraday breakdown area with volume.";

  return { asset, stance, setup, reason, invalidation, newsScore, momentum };
}

async function getMarkets() {
  const ids = Object.values(symbols).map((item) => item.id).join(",");
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=20&page=1&sparkline=true&price_change_percentage=1h,24h,7d`;
  const rows = await fetchJson(url);
  return rows.map((row) => ({
    id: row.id,
    symbol: row.symbol.toUpperCase(),
    name: row.name,
    image: row.image,
    price: row.current_price,
    marketCap: row.market_cap,
    volume24h: row.total_volume,
    change1h: row.price_change_percentage_1h_in_currency,
    change24h: row.price_change_percentage_24h_in_currency,
    change7d: row.price_change_percentage_7d_in_currency,
    high24h: row.high_24h,
    low24h: row.low_24h,
    ath: row.ath,
    sparkline: row.sparkline_in_7d?.price || []
  })).sort((a, b) => (a.symbol === "XRP" ? -1 : b.symbol === "XRP" ? 1 : b.marketCap - a.marketCap));
}

async function getNews(asset = "XRP") {
  const query = symbols[asset]?.query || asset;
  const cryptoCompareUrl = `https://min-api.cryptocompare.com/data/v2/news/?lang=EN&categories=${encodeURIComponent(asset)}`;
  const [ccResult, rssResults] = await Promise.allSettled([
    fetchJson(cryptoCompareUrl, 180_000),
    Promise.allSettled(rssFeeds.map((feed) => fetchText(feed).then((xml) => parseRss(xml, feed))))
  ]);

  const articles = [];
  if (ccResult.status === "fulfilled") {
    const ccArticles = Array.isArray(ccResult.value.Data) ? ccResult.value.Data : [];
    for (const item of ccArticles) {
      articles.push({
        title: item.title,
        link: item.url,
        publishedAt: new Date((item.published_on || Date.now() / 1000) * 1000).toISOString(),
        source: item.source_info?.name || "CryptoCompare",
        summary: stripCdata(item.body || "").slice(0, 260)
      });
    }
  }

  if (rssResults.status === "fulfilled") {
    for (const result of rssResults.value) {
      if (result.status === "fulfilled") articles.push(...result.value);
    }
  }

  const terms = query.toLowerCase().split(/\s+or\s+|\s+/).filter((term) => term.length > 2);
  const filtered = articles.filter((article) => {
    const haystack = `${article.title} ${article.summary}`.toLowerCase();
    return terms.some((term) => haystack.includes(term.toLowerCase())) || asset !== "XRP";
  });

  const unique = new Map();
  for (const article of filtered.length ? filtered : articles) {
    const key = article.link || article.title;
    if (!unique.has(key)) unique.set(key, article);
  }

  return [...unique.values()]
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, 24);
}

async function handleApi(req, res, url) {
  if (url.pathname === "/api/summary") {
    const asset = (url.searchParams.get("asset") || "XRP").toUpperCase();
    const [markets, news] = await Promise.all([getMarkets(), getNews(asset)]);
    const market = markets.find((row) => row.symbol === asset) || markets[0];
    const relevantNews = news.slice(0, 12);
    return json(res, 200, {
      generatedAt: new Date().toISOString(),
      asset,
      markets,
      news: relevantNews,
      drivers: driversFor(asset, relevantNews, market),
      decision: decisionLens(asset, relevantNews, market),
      disclaimer: "Educational decision support only. Not financial advice."
    });
  }
  json(res, 404, { error: "Unknown API route" });
}

async function serveStatic(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = normalize(decodeURIComponent(requested)).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) return sendText(res, 403, "Forbidden");

  try {
    const file = await readFile(filePath);
    res.writeHead(200, { "content-type": mimeTypes[extname(filePath)] || "application/octet-stream" });
    res.end(file);
  } catch {
    sendText(res, 404, "Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  try {
    if (url.pathname === "/healthz") return json(res, 200, { ok: true });
    if (!isAuthorized(req)) return requestAuth(res);
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    return await serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    json(res, 502, { error: "Data source unavailable", detail: error.message });
  }
});

server.listen(port, host, () => {
  console.log(`Crypto Decision Desk running at http://${host}:${port}`);
});
