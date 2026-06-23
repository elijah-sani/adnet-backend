# AdNet Backend — Technical Assessment Submission

**Candidate:** Elijah Sani
**Role:** Backend Engineer
**Company:** AdaIn Technologies Limited
**Submitted in response to:** 72-hour take-home assessment issued by Salefu, Founder of AdaIn Technologies Limited

---

## Assessment Brief (Summary)

The task was to build two core modules for **AdNet**, a financial infrastructure platform for Nigerian SMEs:

- **Task 1** — A `POST /api/v1/transactions/debit` endpoint that processes wallet debit instructions with idempotency, pre-insert logging, and structured error responses
- **Task 2** — A background reconciliation job that detects stale `PENDING` transactions and exposes a `GET /api/v1/reconciliation/status` endpoint

---

## Language & Framework Choice

| Technology | Role | Justification |
|---|---|---|
| **Node.js + TypeScript** | Runtime | Non-blocking I/O suits financial API workloads; TypeScript enforces correctness at the DTO and entity layer |
| **NestJS** | Framework | Opinionated module/DI structure keeps financial logic cleanly separated; built-in `@nestjs/schedule` integrates the cron job without external dependencies |
| **TypeORM** | ORM | Native PostgreSQL support with repository pattern; migration tooling manages schema evolution without raw SQL |
| **PostgreSQL** | Database | ACID-compliant, robust under concurrent writes; `UNIQUE` constraint on `instructionId` is the final safety net against duplicate processing |
| **Docker / docker-compose** | Local environment | Reproducible PostgreSQL setup with a single command; eliminates environment issues for reviewers |

I chose **NestJS** specifically because the assessment listed Node.js as an option and NestJS provides the cleanest path to satisfying the structural requirements — module separation, DI, and built-in scheduling — without reaching for external tooling. TypeScript removes an entire class of runtime bugs in financial logic.

---

## How to Run Locally (5 Steps)

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

> **No Docker?** Create a PostgreSQL database manually, update `.env` with your credentials, then start from step 4.

---

## Testing the Endpoints

**1. Submit a debit instruction**

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

**2. Test idempotency** — re-run the exact same command. The response will be identical and `processedAt` will remain unchanged, confirming the original transaction was returned without reprocessing.

**3. Check reconciliation status**

```bash
curl http://localhost:3000/api/v1/reconciliation/status
```

---

## Idempotency Implementation

Every debit instruction carries a client-supplied `instructionId` (UUID v4). The guarantee is enforced at two levels:

1. **Application-level check** — before inserting, the service queries for an existing row with the same `instructionId`. If found, the original response is returned immediately without re-running any processing logic.

2. **Database-level constraint** — the `transactions` table has a `UNIQUE` constraint on `instructionId`. This is the true safety net: if two concurrent requests pass the application check simultaneously, only one `INSERT` succeeds. The other receives PostgreSQL error `23505` (unique violation), which the service catches and handles by fetching and returning the winning row.

**Result:** no matter how many times the same `instructionId` is submitted — including under concurrent load — the debit is processed exactly once and the caller always receives the same structured response.

---

## Background Job Approach

The reconciliation job uses **`@nestjs/schedule`** (the official NestJS wrapper around `node-cron`) — one of the three approved options in the brief for Node.js.

It was chosen over bare `setInterval` or a standalone `node-cron` instance for two reasons:

- **DI integration** — the job runs inside NestJS's dependency injection container, so `ConfigService`, `SchedulerRegistry`, and TypeORM repositories are available without manual wiring
- **Lifecycle safety** — the job is registered via `onModuleInit` and managed by `SchedulerRegistry`, ensuring correct start/stop behaviour with the application process

The cron interval is **configurable via `RECONCILIATION_CRON`** in `.env`, defaulting to `*/5 * * * *` (every 5 minutes).

On each run the job:
1. Queries all `PENDING` transactions with `createdAt` older than 2 minutes
2. Marks each as `FAILED` with `failureReason = "reconciliation_timeout"`
3. Logs the resolved transaction ID and original `createdAt` timestamp
4. Updates in-memory counters consumed by the status endpoint

---

## API Reference

### `POST /api/v1/transactions/debit`

| Field | Type | Validation |
|---|---|---|
| `instructionId` | `string` (UUID v4) | Required; unique per instruction |
| `accountId` | `string` | Required |
| `amount` | `integer` | Required; positive integer in **kobo** — decimals and negatives are rejected |
| `currency` | `string` | Optional; defaults to `NGN` |
| `narration` | `string` | Required |
| `requestedAt` | `string` (ISO 8601) | Required |

**Success — `201 Created`**
```json
{
  "status": "success",
  "instructionId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "transactionRef": "TXN-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "processedAt": "2026-04-16T10:00:01.123Z",
  "balanceAfter": 0
}
```

**Error — `400 Bad Request`** (validation failure)
```json
{
  "statusCode": 400,
  "message": ["amount must be an integer (kobo, no decimals)"]
}
```

---

### `GET /api/v1/reconciliation/status`

```json
{
  "lastRunAt": "2026-04-16T10:05:00.000Z",
  "lastResolvedCount": 3,
  "currentPendingCount": 1
}
```

| Field | Description |
|---|---|
| `lastRunAt` | ISO timestamp of the most recent job execution (`null` if not yet run since startup) |
| `lastResolvedCount` | Transactions resolved in the last run |
| `currentPendingCount` | Live count of currently `PENDING` transactions |

> `lastRunAt` and `lastResolvedCount` are held in-memory and reset on restart — intentional for this scope; see _What I'd Add_ below.

---

## Environment Variables

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

No secrets are hardcoded. All configuration is consumed via `process.env`.

---

## What I Would Add With More Time

- **Persistent reconciliation state** — store `lastRunAt` and `lastResolvedCount` in the database so the status endpoint survives restarts
- **Distributed locking** — prevent concurrent reconciliation runs across multiple instances (e.g., Redis + `redlock`)
- **Message queue for processing** — offload debit processing to BullMQ workers to decouple API response time from processing latency and enable reliable retries
- **Retry logic with exponential backoff** — retry transient failures before marking a transaction as failed
- **Real balance ledger** — integrate with an accounts table to compute and return a genuine `balanceAfter` rather than a simulated `0`
- **Test coverage** — unit tests targeting the idempotency race-condition path and integration tests for the full debit + reconciliation lifecycle
- **Structured logging** — replace NestJS Logger with a JSON logger (e.g., Pino) for log aggregation compatibility
- **Health check endpoint** — expose `/health` with database connectivity status for orchestration readiness
