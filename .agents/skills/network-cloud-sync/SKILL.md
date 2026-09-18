---
name: network-cloud-sync
description: >-
  Network protocols, cloud synchronization, and remote streaming architecture for CineCraft AI.
  Use when implementing remote asset streaming, HTTP Range requests, cloud project backups,
  or multi-user collaborative editing workflows.
---

# Network & Cloud Sync Architecture: CineCraft AI

This skill provides design patterns and protocols for remote media ingestion, cloud project backup, and real-time collaboration.

## 1. Offline-First Mandate

- **Local Autonomy**: CineCraft AI is fundamentally a local desktop workstation. The full application must launch, edit, decode, grade, and export without requiring an internet connection.
- **Graceful Network Degradation**: If network drops during remote sync, edits are buffered locally in an indexed queue and synchronized seamlessly when connectivity is restored.

## 2. Remote Media Streaming & Range Requests

When working with cloud-hosted proxy media (e.g. S3, Cloudflare R2):
1. **HTTP 206 Partial Content**:
   - The media demuxer must use HTTP `Range: bytes=start-end` headers to fetch only GOP (Group of Pictures) headers and target frame chunks.
   - Never download an entire multi-gigabyte video file to preview a 5-second cut.
2. **Byte-Range Cache**:
   - Cached range responses are indexed in the local scratch cache to avoid re-fetching previously scrubbed intervals.

## 3. Cloud Project Sync & Conflict Resolution

- **Delta Synchronization**:
  - Instead of uploading the entire `.cinecraft` project file on every edit, transmit JSON diff patches representing the executed command.
- **Conflict Handling**:
  - Use vector clocks / revision IDs on project mutations.
  - If a merge conflict occurs between multiple users, the deterministic Command Pattern ensures state can be replayed and reconciled cleanly.

## 4. Network Resilience Best Practices

- **Exponential Backoff**:
  - Implement jittered exponential backoff for cloud storage API calls (retry intervals: 500ms, 1s, 2s, 4s, capped at 16s).
- **Circuit Breaker**:
  - If remote AI inference or cloud upload fails 3 consecutive times, trip the circuit breaker and display a non-intrusive offline indicator in the TopBar.
- **Privacy & Telemetry**:
  - User media and transcripts are NEVER sent to telemetry endpoints.
  - Only anonymized crash stack traces may be transmitted, and only with explicit user opt-in.
