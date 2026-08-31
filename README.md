# Bulk URL Health Checker

A dashboard for submitting a batch of URLs, checking each one in the background, and watching results come in live.

For every URL, the system records: final HTTP status code, response time, and page title (when one exists).

## Stack

- **Node.js + TypeScript** across all apps
- **Fastify** — API server
- **PostgreSQL** — persistent source of truth
- **Redis** — backs BullMQ (job queue) and pub/sub (live updates), plus the batch-list cache
- **BullMQ** — background job processing
- **Next.js (App Router) + TypeScript** — frontend
- **pnpm workspaces** — monorepo, with a `packages/shared` package for types used by both API and web

## Quick Start

From the repo root, with Docker running:

```bash
pnpm install
pnpm dev
```

That's it — one command. It will:

1. Start PostgreSQL and Redis via Docker Compose (`docker compose up -d`)
2. Wait for both to be reachable (`wait-on tcp:5432 tcp:6379`)
3. Start the API, worker, and Next.js dev servers in parallel

On a **first run** (fresh Docker volume), PostgreSQL automatically runs `docker/init.sql` to create the schema — no manual migration step needed.

- Web UI: [http://localhost:3000](http://localhost:3000)
- API: [http://localhost:3001](http://localhost:3001)

To reset all data (wipe DB + Redis and start clean):

```bash
docker compose down -v
pnpm dev
```

### Environment variables

Each app reads from its own `.env` file:

```
# apps/api/.env
DATABASE_URL=postgresql://urltracking:urltracking@127.0.0.1:5432/urltracking
REDIS_URL=redis://127.0.0.1:6379

# apps/worker/.env
DATABASE_URL=postgresql://urltracking:urltracking@127.0.0.1:5432/urltracking
REDIS_URL=redis://127.0.0.1:6379

# apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3001
```

These are committed with local defaults so the app runs out of the box; no secrets involved.

## Architecture

```
                     ┌─────────────────┐
                     │     Next.js     │
                     │    apps/web     │
                     └────────┬────────┘
                              │
                        HTTP + SSE
                              │
                              ▼
                     ┌─────────────────┐
                     │     Fastify     │
                     │     apps/api    │
                     └───────┬─┬───────┘
                             │ │
                 PostgreSQL  │ │  BullMQ / Pub-Sub
                             │ │
                             ▼ ▼
                     ┌─────────────────┐
                     │      Redis      │
                     └────────┬────────┘
                              │
                              ▼
                     ┌─────────────────┐
                     │      Worker     │
                     │   apps/worker   │
                     └────────┬────────┘
                              │
                              ▼
                        External URLs
```

**API** (`apps/api`) — accepts batch submissions, validates them, persists to Postgres inside a transaction, enqueues one BullMQ job per URL, and serves all read/cancel/retry endpoints. Also hosts the SSE endpoint, subscribing to Redis pub/sub to receive live updates from the worker.

**Worker** (`apps/worker`) — a separate process. Consumes jobs from the queue, performs the HTTP check, writes the result to Postgres, recomputes and persists the parent batch's progress counts and status, publishes a lightweight event to Redis so any connected API instance can push it to clients, and invalidates the batch-list cache.

**PostgreSQL** — the single source of truth for all batch/URL state. Every other piece of infrastructure (BullMQ, Redis cache, SSE) can be lost or restarted without losing data, because nothing meaningful lives anywhere else.

**Redis** — used for three distinct things, worth being explicit about since they're easy to conflate:
1. BullMQ's queue storage (job state, scheduling, retries, backoff)
2. Pub/sub channel (`batch-events`) so any API instance can learn a URL finished, regardless of which instance the worker's DB write went through
3. The 30-second batch-list cache (`cache:batches:list`)

**Next.js** — the batch list page is a Server Component (fetches on the server, no client JS needed since it's non-interactive besides navigation and the submit form). The batch detail page is a Client Component, since it holds live state and opens a persistent `EventSource` connection.

## Background Processing Guarantees

- **Concurrency: 5** — set via BullMQ's `Worker` `concurrency` option. Up to 5 URL checks run in parallel within a single worker process.
- **Global rate limit: 10 requests/second** — set via BullMQ's `limiter` option at the `Worker` level. This is enforced through Redis, so it holds true across the whole queue even with multiple worker processes running — it's not a per-process limit.
- **Retries: up to 3, exponential backoff** — configured as `defaultJobOptions` on the `Queue` (`attempts: 3`, `backoff: { type: 'exponential', delay: 2000 }`). A thrown error in the job handler (network failure, timeout, DNS failure) triggers a retry; a non-2xx HTTP response is treated as a valid final result, not retried, since the server did respond.

These were verified under a real stress test (30 concurrent URLs submitted at once, timestamps logged per job start) — job starts never exceeded 10/sec, and flaky domains visibly retried 3 times with growing delays before landing on `failed`.

## Idempotency

Each URL's row `id` (generated client-side via `crypto.randomUUID()` at insert time) is used as the BullMQ job ID (`opts.jobId`). BullMQ deduplicates jobs by ID within a queue, so re-enqueueing the same URL row is a no-op rather than a duplicate job. Manual retries (via `retry-failed`) use a new synthetic job ID (`${urlId}:retry:${timestamp}`) since the original job's terminal record may still exist in BullMQ.

## Cancel & Retry Correctness

**Cancel** — the batch and its still-pending (`queued`/`checking`) URL rows are updated to `cancelled` in a single Postgres transaction first. Then, best-effort, any BullMQ jobs still in the `waiting`/`delayed` state get removed from the queue. Jobs already `active` (in flight) can't be pulled out mid-request — instead, the worker checks the batch/URL's persisted status *before* writing any result, so an in-flight check that finishes after cancellation correctly discards its result instead of overwriting the cancelled state.

**Retry failed** — only URLs with `status = 'failed'` are reset to `queued` and re-enqueued (new job IDs). Already-`succeeded` URLs are never touched.

## Live Updates (SSE)

Chosen over WebSockets because the data flow here is one-directional (server → client) and infrequent — SSE is simpler to implement correctly, reconnects automatically via the browser's native `EventSource`, and works over plain HTTP without extra infrastructure.

- The worker publishes a small event (`{ batchId, urlId, status }`) to a Redis pub/sub channel whenever a URL reaches a terminal state.
- Every API instance subscribes to that channel on startup. Whichever instance is holding a given client's SSE connection receives the event regardless of which instance the worker's write went through — this is what makes it correct under horizontal scaling.
- On receiving an event, the API pushes a small nudge down the SSE stream. The **client does not trust the event payload as final state** — it re-fetches `GET /batches/:id` from Postgres on every nudge, so a missed or out-of-order event never produces incorrect UI state.
- Dropped connections: `EventSource` reconnects automatically by default; on reconnect, the client's initial `GET /batches/:id` fetch (which also runs on mount, not just after events) re-establishes correct state regardless of what was missed while disconnected.
- The stream closes itself server-side (sending a final `batch-complete` event) once a batch has no more pending URLs, rather than staying open indefinitely.

## Batch Progress & Status

`batches.completed_urls`, `batches.failed_urls`, and `batches.status` are maintained directly by the worker, not derived on the fly. After every URL reaches a terminal state (`succeeded`, `failed`, or `cancelled`), the worker recomputes counts from the `urls` table for that batch (`updateBatchProgress`, `apps/worker/src/services/batchProgress.ts`) and writes them back to the `batches` row, setting `status = 'completed'` once no URLs remain `queued`/`checking`.

This update explicitly skips batches whose `status` is already `cancelled`, so a URL check that was already in flight at the moment of cancellation — and finishes afterward — cannot flip a cancelled batch back to `processing`/`completed`.

## Caching

`GET /batches` is cached in Redis for 30 seconds (chosen over in-memory caching specifically so it works correctly across multiple API instances, which an in-memory cache would not).

To avoid visibly stale data, the cache is actively invalidated (not just left to expire) whenever state changes:
- On batch creation, cancel, or retry (from the API)
- On every URL reaching a terminal state (from the worker)

In practice, during active processing the cache is invalidated almost continuously (since URLs are constantly completing), so it mostly serves stale-free reads. Once a batch settles, subsequent list requests are served from cache until either 30s pass or another batch changes state.

## Horizontal Scaling Behavior

If the API is scaled to multiple instances:

- **Batch state** is unaffected — Postgres is the single source of truth read by every instance identically.
- **Job creation/consumption** is unaffected — BullMQ's queue state lives in shared Redis, not any one API/worker process's memory.
- **Rate limiting/concurrency** hold correctly with multiple *worker* processes because the limiter state is coordinated through Redis, not per-process memory.
- **Live updates (SSE)** work correctly across multiple API instances because of the Redis pub/sub layer — any instance can learn about a completed URL and push it to its own connected clients, regardless of which instance actually processed the originating write.
- **The batch-list cache** is shared (Redis-backed), so all instances see the same cached value and the same invalidation.

No component in this design assumes a single API process; nothing here would need to change to run behind a load balancer with N instances.

## Trade-offs & What I'd Do Differently With More Time

- **CSV parsing** on the frontend is intentionally minimal (first column per line, basic `URL()` validation to drop malformed rows) rather than a full CSV parser — sufficient for the assignment's scope but wouldn't handle quoted fields or more complex CSV dialects.
- **No authentication** — explicitly out of scope per the assignment.
- **WSL-specific networking**: in local WSL2 development, some outbound HTTPS checks intermittently fail with `ENETUNREACH` (IPv6) alongside `ETIMEDOUT` (IPv4) — a known WSL2 dual-stack networking quirk, not an application bug. Retry/backoff handles this correctly (confirmed via logs — attempts climbing 1→2→3 with growing delays); a production/non-WSL environment would not exhibit this.
- **Health check timeout** is fixed at 10 seconds per URL; with more time this could be configurable per batch.
- Given more time, I'd add integration tests around the cancel/retry race conditions specifically (in-flight job finishing after cancellation), since these are the parts most likely to regress silently.

## API Endpoints

```
POST   /batches                  Submit a batch of URLs (or CSV, parsed client-side)
GET    /batches                  List all batches (30s cached)
GET    /batches/:id              Full batch detail + all its URL results
POST   /batches/:id/cancel       Cancel a batch (queued + in-flight jobs handled safely)
POST   /batches/:id/retry-failed Re-run only URLs currently in a failed state
GET    /batches/:id/events       Server-Sent Events stream of live updates for a batch
```

## Assumptions

- A submitted URL that responds with a non-2xx HTTP status (e.g. 404, 500) is recorded as a valid, final result — not retried — since the server did respond. Only network-level failures (timeout, DNS failure, connection refused) are treated as retryable.
- Duplicate URLs within a single batch submission are each treated as independent checks (not deduplicated), matching the architecture doc's stated behavior that "each URL submission represents a separate check."



## Loom video:
https://www.loom.com/share/97bad6359d10407f84aa3db7a373c4c8
