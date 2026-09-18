---
name: api-backend-architecture
description: >-
  Production API and backend systems architecture playbook.
  Use when designing or building REST APIs, GraphQL, FastAPI, Node.js, Express/NestJS, Python APIs,
  contract-first OpenAPI schemas, idempotency keys, rate limiting, and resilient microservices.
---

# Master Playbook: Production API & Backend Architecture

This skill governs the design, implementation, and hardening of enterprise-grade APIs and backend services.

---

## 1. Contract-First API Design

Never write ad-hoc routes without a formal contract. Follow OpenAPI 3.1 or Protobuf schemas as the single source of truth:

```text
API Specification (OpenAPI 3.1 / Protobuf)
         │
    ┌────┴──────────────────────────┐
    ▼                               ▼
Backend Server DTOs & Validation   Frontend / Client SDK Generation
(Zod, Pydantic, TypeSpec)         (openapi-typescript, orval)
```

### Invariants:
1. **Strict Request Validation**: Every endpoint must validate input payloads against schemas. Reject unknown or malformed fields with `422 Unprocessable Entity` or `400 Bad Request`.
2. **Predictable Semantic Errors (RFC 7807)**:
   - Always return standardized Problem Details JSON:
     ```json
     {
       "type": "https://api.example.com/errors/insufficient-quota",
       "title": "Insufficient Quota",
       "status": 403,
       "detail": "Your current plan has exceeded its monthly export limit.",
       "instance": "/exports/req_928374",
       "code": "EXACT_MACHINE_READABLE_CODE"
     }
     ```

---

## 2. High-Reliability API Patterns

### 1. Idempotency Keys for Mutations
- For financial transactions, asset exports, or state creation, require an `Idempotency-Key: <uuid>` header:
  - Check cache/DB: If key already processed, return the cached previous response immediately with `200 OK`.
  - If currently in-flight, return `409 Conflict` or lock.
  - Prevents double-charging or duplicate resource creation caused by client retries.

### 2. Cursor-Based Pagination
- ❌ Avoid offset pagination (`OFFSET 10000 LIMIT 20`), which is slow on large tables and skips/duplicates rows during live writes.
- ✅ Use opaque cursor pagination based on indexed columns:
  ```sql
  SELECT * FROM assets WHERE (created_at, id) < (:cursor_created_at, :cursor_id)
  ORDER BY created_at DESC, id DESC LIMIT 20;
  ```

---

## 3. Defense & Resiliency

1. **Multi-Tier Rate Limiting**:
   - Apply Token Bucket or Sliding Window algorithm using Redis.
   - Enforce limits per IP for public endpoints and per API token / user ID for authenticated routes.
   - Return standard headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`.

2. **Circuit Breakers for Downstream Dependencies**:
   - If a third-party AI service or payment gateway fails > 50% over a 10s window, trip the breaker.
   - Return fast cached or degraded responses rather than exhausting backend thread pools.

3. **Graceful Shutdown Protocol**:
   - Intercept `SIGTERM` / `SIGINT`.
   - Stop accepting new incoming connections on HTTP listener.
   - Allow up to 30 seconds for in-flight requests to finalize before cleanly closing database connection pools and exiting.
