# Crypto Decision Desk

A local crypto trading decision-support dashboard with XRP pinned as the lead watchlist asset.

## Run

```bash
node server.js
```

Open http://localhost:4173.

If that port is busy, run:

```bash
PORT=4174 node server.js
```

## Run with a password

```bash
CRYPTO_USER=trader CRYPTO_PASSWORD=your-long-password node server.js
```

The production deployment requires `CRYPTO_PASSWORD`. Your browser will show a standard username/password prompt.

## Deploy for phone access anywhere

The project includes `render.yaml`, so Render can deploy it directly from GitHub.

1. Create a GitHub repo and push this folder.
2. In Render, choose **New > Blueprint** and select that repo.
3. Set the required environment variable:
   - `CRYPTO_PASSWORD`: a long private password
4. Deploy.

Render will give you a public `https://...onrender.com` URL that works from your phone anywhere. Use:

- Username: `trader`
- Password: whatever you set as `CRYPTO_PASSWORD`

## What it does

- Pulls live market data from CoinGecko.
- Pulls crypto headlines from CryptoCompare and several public RSS feeds.
- Highlights likely drivers affecting the selected asset.
- Produces a simple decision lens: momentum, defensive, high-risk, or wait.

This is educational decision support only. It is not financial advice and should not be used as the only basis for a trade.
