# Main Program (V1)

This is the executable homepage main program for Shiran.

## What is implemented

- Conway Game of Life core loop
- Weak onboarding hint (first visit only)
- Slow breathing generation transition (3s/4s/5s, default 4s)
- Click live cell -> open module placeholder card
- Click dead cell -> nearest active module hint
- Overview drawer with search/filter-ready list
- Dynamic loading from `../v1_foundation/model-index.v1.json`

## Run locally

Use any static file server from repo root. Example:

```powershell
cd e:\code\shiran
python -m http.server 8787
```

Then open:

- `http://localhost:8787/main_program/`

## Notes

- Homepage modules load from `../v1_foundation/model-index.v1.json`.
- Production prefers `status=published`; the current library is published.
- Wheel / slider / keyboard zoom loops into child and parent layers instead of stopping at min/max.
- Telemetry posts to `/api/v1/events/batch` and also logs to console.

## Global Visit Counter (Vercel)

This repo now includes a server-side counter endpoint:

- `GET /api/visits`: read current stats
- `POST /api/visits`: increment page view and return latest stats

Required environment variables in Vercel:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

You can get them by creating a **Vercel KV** database and linking it to this project.
