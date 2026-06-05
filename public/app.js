const state = {
  asset: "XRP",
  summary: null
};

const els = {
  assetSelect: document.querySelector("#assetSelect"),
  refreshBtn: document.querySelector("#refreshBtn"),
  assetIcon: document.querySelector("#assetIcon"),
  assetName: document.querySelector("#assetName"),
  lastUpdated: document.querySelector("#lastUpdated"),
  assetPrice: document.querySelector("#assetPrice"),
  assetChange: document.querySelector("#assetChange"),
  sparkline: document.querySelector("#sparkline"),
  stance: document.querySelector("#stance"),
  setup: document.querySelector("#setup"),
  reason: document.querySelector("#reason"),
  invalidation: document.querySelector("#invalidation"),
  marketGrid: document.querySelector("#marketGrid"),
  driversList: document.querySelector("#driversList"),
  newsTitle: document.querySelector("#newsTitle"),
  newsList: document.querySelector("#newsList"),
  toast: document.querySelector("#toast")
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 6
});

const compactMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2
});

function formatPercent(value) {
  if (!Number.isFinite(value)) return "0.00%";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function toneClass(value) {
  if (value > 0.2) return "positive";
  if (value < -0.2) return "negative";
  return "neutral";
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.setTimeout(() => els.toast.classList.remove("show"), 3600);
}

function drawSparkline(points) {
  const canvas = els.sparkline;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);

  if (!points?.length) return;

  const pad = 8;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const spread = max - min || 1;
  const xStep = (rect.width - pad * 2) / Math.max(points.length - 1, 1);
  const path = new Path2D();

  points.forEach((point, index) => {
    const x = pad + index * xStep;
    const y = rect.height - pad - ((point - min) / spread) * (rect.height - pad * 2);
    if (index === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  });

  const gradient = ctx.createLinearGradient(0, 0, rect.width, 0);
  gradient.addColorStop(0, "#6fb6ff");
  gradient.addColorStop(1, "#48d597");
  ctx.lineWidth = 3;
  ctx.strokeStyle = gradient;
  ctx.stroke(path);
}

function renderMarketCards(markets) {
  els.marketGrid.innerHTML = markets.map((market) => `
    <article class="market-card ${market.symbol === "XRP" ? "is-xrp" : ""}">
      <div class="market-top">
        <span class="market-symbol">${market.symbol}</span>
        <span class="pill ${toneClass(market.change24h)}">${formatPercent(market.change24h)}</span>
      </div>
      <span class="market-price">${money.format(market.price)}</span>
      <div class="metric-row"><span>Volume</span><span>${compactMoney.format(market.volume24h)}</span></div>
      <div class="metric-row"><span>7d</span><span>${formatPercent(market.change7d)}</span></div>
    </article>
  `).join("");
}

function renderDrivers(drivers) {
  els.driversList.innerHTML = drivers.map((driver) => `
    <article class="driver">
      <strong>${driver.label}</strong>
      <p class="muted">${driver.detail}</p>
    </article>
  `).join("");
}

function relativeTime(dateString) {
  const diff = Date.now() - new Date(dateString).getTime();
  const minutes = Math.max(1, Math.round(diff / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function renderNews(asset, news) {
  els.newsTitle.textContent = `${asset} news`;
  els.newsList.innerHTML = news.map((article) => `
    <article class="article">
      <a href="${article.link}" target="_blank" rel="noreferrer">${article.title}</a>
      <p class="muted">${article.summary || "No summary available."}</p>
      <div class="article-meta">
        <span>${article.source}</span>
        <span>${relativeTime(article.publishedAt)}</span>
      </div>
    </article>
  `).join("");
}

function render(summary) {
  const market = summary.markets.find((row) => row.symbol === summary.asset) || summary.markets[0];
  els.assetIcon.src = market.image;
  els.assetName.textContent = `${market.name} (${market.symbol})`;
  els.lastUpdated.textContent = `Updated ${new Date(summary.generatedAt).toLocaleString()} · ${summary.disclaimer}`;
  els.assetPrice.textContent = money.format(market.price);
  els.assetChange.textContent = formatPercent(market.change24h);
  els.assetChange.className = `pill ${toneClass(market.change24h)}`;
  els.stance.textContent = summary.decision.stance;
  els.setup.textContent = summary.decision.setup;
  els.reason.textContent = summary.decision.reason;
  els.invalidation.textContent = summary.decision.invalidation;

  renderMarketCards(summary.markets);
  renderDrivers(summary.drivers);
  renderNews(summary.asset, summary.news);
  drawSparkline(market.sparkline);
}

async function loadSummary(asset = state.asset) {
  els.refreshBtn.disabled = true;
  els.refreshBtn.textContent = "Loading";
  try {
    const response = await fetch(`/api/summary?asset=${encodeURIComponent(asset)}`);
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    state.summary = await response.json();
    state.asset = asset;
    render(state.summary);
  } catch (error) {
    console.error(error);
    toast("Could not load live crypto data. Check the server console or network access.");
  } finally {
    els.refreshBtn.disabled = false;
    els.refreshBtn.textContent = "Refresh";
  }
}

els.assetSelect.addEventListener("change", (event) => loadSummary(event.target.value));
els.refreshBtn.addEventListener("click", () => loadSummary(state.asset));
window.addEventListener("resize", () => {
  const market = state.summary?.markets.find((row) => row.symbol === state.asset);
  if (market) drawSparkline(market.sparkline);
});

loadSummary();
