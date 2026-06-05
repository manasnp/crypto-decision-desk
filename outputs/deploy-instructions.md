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
4. Add this secret environment variable:
   - `CRYPTO_PASSWORD`: a long private password
5. Deploy.

The username defaults to `trader`.

## Notes

- Render reads `render.yaml`.
- The app exposes `/healthz` for hosting health checks.
- Production mode refuses to start without `CRYPTO_PASSWORD`.
- This is educational decision support, not financial advice.
