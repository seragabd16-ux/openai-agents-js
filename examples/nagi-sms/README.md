# NAGI-SMS

A production-ready SMS campaign dashboard built with Express, Prisma, Next.js, and Tailwind.

## Features

- Create SMS campaigns and import up to 6,000 recipients.
- Template variables using `{{name}}` style tokens.
- Unsubscribe list respected before sending.
- Live campaign progress with pending/sent/failed stats.
- HTTP API secured by `x-nagi-api-key` header for automation.
- Dockerized frontend and backend for easy deployment.

## Running locally

1. Copy environment examples and adjust values:
   ```bash
   cp examples/nagi-sms-backend/.env.example examples/nagi-sms-backend/.env
   cp examples/nagi-sms-frontend/.env.example examples/nagi-sms-frontend/.env
   ```
2. From the repo root install dependencies for each package (pnpm or npm):
   ```bash
   cd examples/nagi-sms-backend && npm install && npm run prisma:generate
   cd ../nagi-sms-frontend && npm install
   ```
3. Initialize the SQLite database and migrations (first time):
   ```bash
   cd examples/nagi-sms-backend
   npx prisma migrate dev --name init
   ```
4. Start backend then frontend:
   ```bash
   npm run dev   # in backend folder
   npm run dev   # in frontend folder
   ```
5. Visit http://localhost:3000 and ensure `NEXT_PUBLIC_API_BASE` points to your backend.

## Docker compose

From `examples/nagi-sms` run:

```bash
docker compose up --build
```

The frontend will be on port 3000 and backend on 4000.

## Compliance and safety

- Only contact people who have explicitly opted in.
- Honor opt-out keywords and maintain the unsubscribe (STOP) list; this app removes unsubscribed numbers before sending.
- Follow local laws and carrier rules including consent, rate limits, quiet hours, and data protection requirements.
- Secure your `NAGI_API_KEY` and SMS provider credentials in environment variables.

## API quick reference

All protected routes require the `x-nagi-api-key` header matching `NAGI_API_KEY`.

- `POST /api/campaigns` — create a campaign `{ name, message, numbers }` (max 6000 numbers).
- `POST /api/campaigns/:id/send` — send pending messages with provider throttling.
- `GET /api/campaigns` — list campaigns with stats.
- `GET /api/campaigns/:id` — details and message statuses.
- `POST /api/unsubscribe` — public endpoint to add to unsubscribe list.
- `GET /api/jobs` — recent send jobs for debugging.
