# DreamHost PHP API

This folder is a DreamHost-friendly PHP replacement for the local Node API in `server/`.

## What it does

- mirrors the current frontend endpoints under `/api`
- keeps your database on the shared server
- lets Vercel call HTTPS endpoints instead of connecting to MySQL directly

## Files

- `api/index.php`: single router for all API endpoints
- `api/.htaccess`: rewrites `/api/...` requests to `index.php`
- `api/config.example.php`: copy to `api/config.php` and fill in real values

## Deploy on DreamHost

1. Copy the `dreamhost-api/api` folder contents into your DreamHost site at the web root `api` directory.
2. Copy `config.example.php` to `config.php`.
3. Fill in your DreamHost MySQL hostname, database name, username, and password.
4. Set `allowed_origins` to your real Vercel frontend domain and any local dev origin you want to keep.
5. Visit `/api/test` to confirm the API is live.

## Frontend env

Local development:

```env
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_API_TOKEN=replace-with-the-same-token-as-config.php
```

Vercel production:

```env
REACT_APP_API_URL=https://abcbackflow.yddconsultinng.com/api
REACT_APP_API_TOKEN=replace-with-the-same-token-as-config.php
```

## Notes

- This is additive. Your existing local Node server still works.
- The PHP API currently mirrors the app's existing invoice, quote, past-due, and upcoming-tests routes.
- If DreamHost blocks `.htaccess` rewrites for your specific setup, route handling will need a small adjustment.
- The API now requires the `X-API-Token` header for all routes except `/api/test`.
- CORS is fail-closed: only exact origins listed in `config.php` are allowed.
- Basic request logs are written to `dreamhost-api/logs/api.log` unless you change `security.log_file`.
