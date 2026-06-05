# Crypto Decision Desk Deployment

The app is ready to deploy from GitHub to Render.

## GitHub

The repository is available at:

```text
https://github.com/manasnp/crypto-decision-desk
```

## Render

1. Open Render.
2. Choose **New > Blueprint**.
3. Select the GitHub repo.
4. Deploy.

No password is required unless you set `CRYPTO_PASSWORD` yourself.

## Notes

- Render reads `render.yaml`.
- The app exposes `/healthz` for hosting health checks.
- Password protection is optional. Set `CRYPTO_PASSWORD` only if you want a login prompt.
- This is educational decision support, not financial advice.
