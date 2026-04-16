# AdNet Transaction Service

## Overview

AdNet Transaction Service is the core financial processing backend for AdNet, a payments infrastructure platform targeting Nigerian SMEs. It exposes a wallet debit API that persists every instruction to PostgreSQL **before** processing begins, ensuring no transaction is silently lost. Idempotency is enforced at both the application and database layer — submitting the same `instructionId` twice always returns the original outcome without reprocessing. A background reconciliation job runs every five minutes to detect and resolve transactions that remain in a `PENDING` state beyond the expected processing window. The service is designed for reliability and auditability, consistent with the demands of financial systems operating in high-throughput environments.

---

## Tech Stack

| Technology | Role | Why |
|---|---|---|
| **Node.js + TypeScript** | Runtime | Non-blocking I/O suits financial API workloads; TypeScript enforces correctness at the DTO and entity layer |
| **NestJS** | Framework | Opinionated module/DI structure keeps financial logic cleanly separated; built-in `@nestjs/schedule` integrates the cron job without external dependencies |
| **TypeORM** | ORM | Native PostgreSQL support with repository pattern; migration tooling manages schema evolution without raw SQL |
| **PostgreSQL** | Database | ACID-compliant, robust under concurrent writes; `UNIQUE` constraint on `instructionId` is the final safety net against duplicate processing |
| **Docker / docker-compose** | Local environment | Reproducible PostgreSQL setup with a single command; eliminates "works on my machine" issues for reviewers |

---

## Setup Instructions

### Option A — Docker (recommended)

```bash
# 1. Clone and install dependencies
git clone <repo-url> && cd adnet-backend
npm install

# 2. Copy environment config
cp .env.example .env

# 3. Start the PostgreSQL container
docker compose up -d

# 4. Run database migrations
npm run migration:run

# 5. Start the server
npm run start:dev
```

The API will be available at `http://localhost:3000`.

### Option B — Manual PostgreSQL

```bash
# 1. Clone and install dependencies
git clone <repo-url> && cd adnet-backend
npm install

# 2. Create a PostgreSQL database, then update .env accordingly
cp .env.example .env

# 3. Run migrations
npm run migration:run

# 4. Start the server
npm run start:dev
```

---

## Testing the API

Once the server is running, you can test the core requirements using the provided endpoints.

**1. Create a Wallet Debit**

```bash
curl -X POST http://localhost:3000/api/v1/transactions/debit \
  -H "Content-Type: application/json" \
  -d '{
    "instructionId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "accountId": "ACC-001",
    "amount": 50000,
    "currency": "NGN",
    "narration": "Payment for invoice #1024",
    "requestedAt": "2026-04-16T10:00:00.000Z"
  }'
```

**2. Test Idempotency**

Run the exact same `curl` command above again. You will receive an identical `201 Created` response. Check the `processedAt` timestamp — it will remain completely unchanged, proving the system returned the original transaction without reprocessing.

**3. Test Reconciliation Status**

```bash
curl http://localhost:3000/api/v1/reconciliation/status
```

---

## API Documentation

### `POST /api/v1/transactions/debit`

Initiates a wallet debit for a given account. The transaction is written to the database before any processing occurs.

**Request Body**

```json
{
  "instructionId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "accountId": "ACC-001",
  "amount": 50000,
  "currency": "NGN",
  "narration": "Payment for invoice #1024",
  "requestedAt": "2026-04-16T10:00:00.000Z"
}
```

| Field | Type | Validation |
|---|---|---|
| `instructionId` | `string` (UUID v4) | Required, unique per debit instruction |
| `accountId` | `string` | Required |
| `amount` | `integer` | Required; must be a **positive integer in kobo** (no decimals, no negatives) |
| `currency` | `string` | Optional; defaults to `NGN` |
| `narration` | `string` | Required |
| `requestedAt` | `string` (ISO 8601) | Required |

**Success Response — `201 Created`**

```json
{
  "status": "success",
  "instructionId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "transactionRef": "TXN-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "processedAt": "2026-04-16T10:00:01.123Z",
  "balanceAfter": 0
}
```

**Error Response — `400 Bad Request`** (validation failure)

```json
{
  "statusCode": 400,
  "message": ["amount must be an integer (kobo, no decimals)"]
}
```

---

## Idempotency Implementation

Every debit instruction carries a client-supplied `instructionId` (UUID v4). The idempotency guarantee is enforced at two levels:

1. **Application-level check** — before inserting, the service queries the database for an existing row with the same `instructionId`. If found, the original response is returned immediately without re-running any processing logic.

2. **Database-level constraint** — the `transactions` table has a `UNIQUE` constraint on `instructionId`. This acts as the true safety net: if two concurrent requests pass the application check simultaneously, only one INSERT succeeds. The other receives a PostgreSQL error code `23505` (unique violation), which the service catches and handles by fetching and returning the winning row.

**The result:** no matter how many times the same `instructionId` is submitted — including under concurrent load — the debit is processed exactly once and the caller always receives the same structured response.

---

## Reconciliation Job

### How it works

The reconciliation job is scheduled via `@nestjs/schedule` and runs entirely within the same process — no external scheduler required. The cron expression is **configurable via the `RECONCILIATION_CRON` environment variable**, defaulting to `*/5 * * * *` (every 5 minutes) if not set.

On each run:

1. Queries all transactions in `PENDING` status with a `createdAt` older than **2 minutes**
2. Marks each stale transaction as `FAILED` with `failureReason = "reconciliation_timeout"`
3. Logs the resolved transaction ID and its original `createdAt` timestamp
4. Updates in-memory counters (`lastRunAt`, `lastResolvedCount`) consumed by the status endpoint

### Why `@nestjs/schedule` (node-cron)

`@nestjs/schedule` is the official NestJS wrapper around `node-cron` — one of the three approved background job approaches listed in the brief for Node.js. It was chosen over bare `node-cron` or `setInterval` for two reasons:

- **DI integration** — the job runs inside NestJS's dependency injection container, so `ConfigService`, `SchedulerRegistry`, and `TypeORM` repositories are all available without any manual wiring
- **Lifecycle safety** — the job is registered via `onModuleInit` and managed by `SchedulerRegistry`, ensuring it starts and stops correctly with the application process

---

## Reconciliation Status Endpoint

### `GET /api/v1/reconciliation/status`

Returns the current state of the reconciliation subsystem.

**Response**

```json
{
  "lastRunAt": "2026-04-16T10:05:00.000Z",
  "lastResolvedCount": 3,
  "currentPendingCount": 1
}
```

| Field | Description |
|---|---|
| `lastRunAt` | ISO timestamp of the most recent job execution (`null` if the job has not run yet since startup) |
| `lastResolvedCount` | Number of stale transactions resolved in the last job run |
| `currentPendingCount` | Live count of transactions currently in `PENDING` status |

> **Note:** `lastRunAt` and `lastResolvedCount` are maintained in-memory and reset on application restart. This is an intentional design choice for this scope — see Improvements below.

---

## Database

PostgreSQL is the sole data store. Schema is managed via TypeORM migrations located in `src/migrations/`. Migrations are applied at startup with `npm run migration:run` and generate a clean, versioned schema history.

Key schema decisions:
- All monetary amounts stored as integers (kobo) — no floating-point columns
- `instructionId` has a `UNIQUE` index to enforce idempotency at the database level
- All IDs are UUID v4

---

## Environment Variables

Copy `.env.example` to `.env` and populate before running:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=adnet_db
PORT=3000

# Cron expression for the reconciliation job (default: every 5 minutes)
RECONCILIATION_CRON=*/5 * * * *
```

No secrets are hardcoded. All configuration is read from `process.env` via the TypeORM `DataSource` configuration and NestJS bootstrap.

---

## Potential Improvements

Given more time or a production context, the following would be prioritised:

- **Persistent reconciliation state** — store `lastRunAt` and `lastResolvedCount` in the database so the status endpoint survives restarts
- **Distributed locking** — prevent reconciliation from running concurrently across multiple instances (e.g., using Redis with `redlock`)
- **Message queue for processing** — offload debit processing to BullMQ/Redis workers to decouple API response time from processing latency and enable reliable retries
- **Retry logic with exponential backoff** — for transient processing failures, retry before marking a transaction as failed
- **Real balance ledger** — integrate with an accounts table to compute and return a genuine `balanceAfter` instead of the simulated `0`
- **Test coverage** — unit tests for the idempotency race condition path and integration tests for the full debit + reconciliation lifecycle
- **Structured logging** — replace NestJS Logger with a JSON logger (e.g., Pino) for log aggregation compatibility
- **Health check endpoint** — expose `/health` with database connectivity status for orchestration readiness checks
