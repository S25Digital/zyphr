# Zyphr

Zyphr is a resilient and distributed HTTP request circuit breaker for Node.js. It simplifies outbound HTTP calls while protecting your system from cascading failures using local circuit breaking and a cluster‑wide global failure gate.

Zyphr is designed for **resilience**, not delayed response delivery.

---

## Features

- **Resilient Circuit Breaking** – Prevents repeated failing requests from overwhelming downstream systems.
- **Distributed Global Gate** – Uses Redis so all service instances stop traffic when one detects failure.
- **Background Replay (Optional)** – Failed requests can be retried automatically once recovery occurs.
- **Simple HTTP Methods** – Clean API wrapping Axios.
- **Scenario-Based Control** – Choose fail-fast or queue-and-retry behavior.

---

## Installation

```bash
npm install zyphr
```

---

## Usage

```ts
import Zyphr, { SCENARIO } from "zyphr";

const zyphr = new Zyphr({
  resetTimeout: 5000,
  scenario: SCENARIO.QUEUE_REQUEST,
  redisConfig: { host: "localhost", port: 6379 }
});

await zyphr.post("/orders", { id: 123 });
```

---

# API Reference

Zyphr provides:

- Local circuit breaking
- Cluster-wide failure gating
- Optional background replay

It is **not** a job processor or delayed response system.

---

## `new Zyphr(options)`

Creates a new Zyphr instance.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `resetTimeout` | `number` | ✅ | Time (ms) before breaker attempts recovery |
| `scenario` | `SCENARIO` | ✅ | Behavior when circuit is open |
| `redisConfig` | `RedisOptions` | ❌ | Redis connection for global gate & queue |
| `stateKey` | `string` | ❌ | Redis key used for global circuit state |
| `globalTtl` | `number` | ❌ | TTL (seconds) for global open state |

---

## `SCENARIO`

```ts
enum SCENARIO {
  RETURN_ERROR = 1,
  QUEUE_REQUEST = 2
}
```

| Scenario | Behavior |
|----------|----------|
| `RETURN_ERROR` | Immediately throws error when circuit is open |
| `QUEUE_REQUEST` | Queues request for background retry and throws error |

---

## HTTP Methods

All methods return a **Promise<AxiosResponse>**

- `get(url, config?)`
- `post(url, data?, config?)`
- `put(url, data?, config?)`
- `delete(url, config?)`

---

## Circuit Behavior

| Layer | Purpose |
|------|---------|
| Local Circuit Breaker | Detects failures in current container |
| Global Gate (Redis) | Stops traffic across all containers |

When one instance trips, all instances stop sending traffic.

---

## Queue Behavior (Important)

If `scenario = QUEUE_REQUEST`:

- Request is stored for background retry
- Client does **not** receive a later response
- Replay happens only after recovery

This queue supports:

- Idempotent updates
- Webhook retries
- State reconciliation
- Eventual consistency

It is **not** for real-time user flows.

---

## Errors

| Condition | Error |
|-----------|------|
| Circuit open (Scenario 1) | `Error: Circuit is globally open` |
| Circuit open (Scenario 2) | `Error: Circuit is globally open. Request has been queued.` |

---

## Guarantees

| Guarantee | Status |
|-----------|--------|
| Prevents cascading failures | ✅ |
| Cluster-wide traffic stop | ✅ |
| Background retry | ✅ |
| Delayed client response | ❌ |
| Exactly-once execution | ❌ |

---

## Redis Requirement

Redis is required for:

- Global circuit state
- Queue coordination

All Zyphr instances should share the same Redis.

---

## License

MIT
