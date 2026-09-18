---
name: storage-database
description: >-
  Storage and database architecture for CineCraft AI video editor.
  Use when designing or modifying project persistence (.cinecraft JSON schema),
  SQLite metadata storage, vector index for semantic search, and LRU disk caching.
---

# Storage & Database Architecture: CineCraft AI

This skill provides procedures and invariants for data persistence, asset indexing, and disk cache management in CineCraft AI.

## 1. Non-Destructive Editing Model (Invariant 2)

- **Source Media Immutability**: Source video and audio files on disk are NEVER modified, overwritten, or re-encoded during editing operations.
- **Reference-Based EDL**: The project file is an Edit Decision List (EDL) containing:
  - Absolute/relative file paths and source SHA-256 hashes.
  - RationalTime in/out cut points (`trimIn`, `trimOut`).
  - Track timeline placement offsets (`timelineStart`, `duration`).
  - Parametric transformations and non-destructive effect chains.

## 2. Project File Persistence (`.cinecraft`)

1. **Atomic Saving**:
   - Never write directly to the target project file.
   - Always write to a temporary file (`project.cinecraft.tmp`) and then atomically rename/replace the target file:
     ```typescript
     await nativeBridge.atomicWriteFile(targetPath, serializedProjectJson);
     ```
   - Maintain a rolling backup (`project.cinecraft.bak`) to safeguard against power loss or crashes.

2. **Schema Versioning**:
   - Every project file includes `"schemaVersion": "1.0.0"`.
   - Implement forward-compatible migrations when the timeline data model evolves.

## 3. SQLite Metadata & Semantic Search Database

- **Catalog Database**:
  - Embedded SQLite database located in app data directory:
    `~/.cinecraft/catalog.db`
  - Tables:
    - `assets`: `(id, file_path, sha256, duration_us, width, height, fps, codec, created_at)`
    - `transcripts`: `(id, asset_id, word, start_us, end_us, confidence)`
    - `embeddings`: `(id, asset_id, timestamp_us, embedding_vector, label)`
- **Full-Text & Vector Search (R7.5)**:
  - FTS5 virtual table for lightning-fast transcript search.
  - Cosine distance index over 512-dim or 768-dim CLIP/SigLIP multimodal embeddings.
  - Safe fallback: Deterministic string token overlap search when native vector extensions are uninitialized.

## 4. LRU Cache & Temporary File Hygiene

- **Waveform & Thumbnail Cache**:
  - Waveform peaks stored as binary float arrays (`.peak` files).
  - Filmstrip thumbnails cached at fixed intervals (e.g. 1 thumbnail per second).
  - Maximum cache budget: 10 GB default, managed via Least Recently Used (LRU) eviction.
- **Temp Directory Cleanup**:
  - Transient render files, proxy video segments, and intermediate demux buffers must be tracked in a session registry and purged on app exit.
