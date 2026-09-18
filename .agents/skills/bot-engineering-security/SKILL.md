---
name: bot-engineering-security
description: >-
  Production engineering and security protocols for Telegram and Discord bots.
  Use when building Telegram bots (webhooks, secret tokens, telegraf, python-telegram-bot),
  Discord bots (slash commands, Ed25519 signature verification, sharding), and bot anti-abuse.
---

# Master Playbook: Telegram & Discord Bot Engineering & Security

This skill provides complete architectures and security protocols for deploying scalable, attack-resilient Telegram and Discord bots.

---

## 1. Telegram Bot Architecture & Webhook Security

### 1. Long-Polling vs. Webhook
- **Development**: Use long-polling (`getUpdates`) for local development without exposing public ports.
- **Production**: MUST use Webhooks (`setWebhook`) behind an SSL/TLS reverse proxy (FastAPI, Express, Cloudflare Worker).

### 2. Mandatory Webhook Secret Token Verification
Never accept webhook payloads blindly:
- When registering the webhook with Telegram API, supply a secret token:
  ```bash
  curl -F "url=https://bot.example.com/api/telegram" \
       -F "secret_token=YOUR_RANDOM_HIGH_ENTROPY_HEX_SECRET" \
       https://api.telegram.org/bot<TOKEN>/setWebhook
  ```
- In your backend endpoint, verify the incoming HTTP header before processing:
  ```typescript
  const receivedToken = req.headers['x-telegram-bot-api-secret-token'];
  if (receivedToken !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return res.status(401).send('Unauthorized');
  }
  ```

### 3. Finite State Machines (FSM) for Conversations
- For multi-step wizard dialogues (e.g. form filling, settings), use an explicit FSM stored in Redis or database:
  - User State: `IDLE` -> `AWAITING_MEDIA` -> `AWAITING_TITLE` -> `CONFIRMED`.
  - Set a 10-minute state TTL to prevent abandoned sessions from hanging forever.

---

## 2. Discord Bot Architecture & Interaction Security

### 1. HTTP Interactions & Ed25519 Verification
Discord allows serverless interaction bots without keeping a permanent WebSocket gateway open. However, every HTTP POST request MUST be verified using Ed25519:

```typescript
import nacl from 'tweetnacl';

export function verifyDiscordRequest(req, clientPublicKey: string): boolean {
  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];
  const body = JSON.stringify(req.body);

  if (!signature || !timestamp) return false;

  return nacl.sign.detached.verify(
    Buffer.from(timestamp + body),
    Buffer.from(signature, 'hex'),
    Buffer.from(clientPublicKey, 'hex')
  );
}
```
If verification fails, return `401 Unauthorized` immediately.

### 2. The 3-Second Rule (Defer Response)
- Discord API enforces a strict **3-second timeout** on slash command interactions.
- If processing will take longer than 2.5 seconds (e.g. AI inference, database lookups, video rendering):
  - Send an immediate ACK deferral response within 1 second:
    `{ type: 5 }` (`DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE`).
  - Compute the result asynchronously in the background.
  - Send follow-up update via Discord webhook edit endpoint.

### 3. Gateway Sharding for Large Scale
- When a Discord bot exceeds 2,500 guilds (servers), Discord mandates Gateway Sharding.
- Spawn discrete shard processes or containers managing subsets of guild IDs.

---

## 3. Bot Anti-Abuse & Rate Limiting

- **Per-User Sliding Window Rate Limit**: Limit users to max 10 commands per minute to prevent API spam.
- **Input Sanitization**: Strip markdown/HTML injection from user text before formatting messages.
- **Zero Token Leaks**: Never hardcode bot tokens in source code. Run automated secret scanners (`gitleaks`, `trufflehog`) in CI.
