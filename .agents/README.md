# Universal AI Agent Master Skills & Architecture Suite (`.agents/`)

This directory contains the **Enterprise Master AI Skills** and architectural runbooks covering the entire software lifecycle: from PRD and planning, to desktop, mobile, backend APIs, bots, AI agents, and production operations.

---

## 🌟 Tier 1: Universal Engineering & Architecture Master Skills

These master skills apply to **ANY software project or technology stack**:

| Master Skill | Directory | Core Mission |
| :--- | :--- | :--- |
| **[project-management-prd-execution](file:///c:/Users/Hp/code/.agents/skills/project-management-prd-execution/SKILL.md)** | `skills/project-management-prd-execution/` | Actionable PRD writing, Work Breakdown Structure (3-hour atomic tasks), critical path dependency mapping, trunk-based feature flags, expand/contract DB migrations. |
| **[system-architecture-planning](file:///c:/Users/Hp/code/.agents/skills/system-architecture-planning/SKILL.md)** | `skills/system-architecture-planning/` | Phased architecture (P0 to P3), living roadmaps (`ROADMAP.md`), Single Source of Truth (`PROGRESS.md`), Architecture Decision Records (ADRs). |
| **[agent-autonomous-collaboration](file:///c:/Users/Hp/code/.agents/skills/agent-autonomous-collaboration/SKILL.md)** | `skills/agent-autonomous-collaboration/` | Multi-agent coordination (Jules, OpenHands, Claude), task claiming rules (`chore: claim task <ID>`), mechanical gates law, append-only session handoffs. |
| **[vibe-coding-methodology](file:///c:/Users/Hp/code/.agents/skills/vibe-coding-methodology/SKILL.md)** | `skills/vibe-coding-methodology/` | Disciplined vibe-coding: 6-stage loop (Scope → Propose → Implement → Test → Document → Release), context inside repo, plan confirmation before file edits. |
| **[test-driven-verification](file:///c:/Users/Hp/code/.agents/skills/test-driven-verification/SKILL.md)** | `skills/test-driven-verification/` | TDD for AI, mechanical verification gates, guarding against "green test on stub = false victory", 5-layer testing hierarchy. |
| **[fullstack-production-devops](file:///c:/Users/Hp/code/.agents/skills/fullstack-production-devops/SKILL.md)** | `skills/fullstack-production-devops/` | 4-tier clean architecture, multi-OS GitHub Actions CI/CD workflows, dependency audits (`npm/cargo audit`), React error boundaries, structured JSON logging. |
| **[genai-agentic-engineering](file:///c:/Users/Hp/code/.agents/skills/genai-agentic-engineering/SKILL.md)** | `skills/genai-agentic-engineering/` | ReAct reasoning loops, Model Context Protocol (FastMCP), typed JSON tools, multimodal vector search, human-in-the-loop triggers. |
| **[repository-structure-hygiene](file:///c:/Users/Hp/code/.agents/skills/repository-structure-hygiene/SKILL.md)** | `skills/repository-structure-hygiene/` | Canonical directory hierarchy, conventional commits (`feat:`, `fix:`, `chore:`), atomic branches, `.gitignore` discipline, documentation integrity. |

---

## 📱 Tier 2: Platform Targets & Systems Engineering Master Skills

| Platform Skill | Directory | Core Mission |
| :--- | :--- | :--- |
| **[mobile-android-production](file:///c:/Users/Hp/code/.agents/skills/mobile-android-production/SKILL.md)** | `skills/mobile-android-production/` | Clean Architecture (MVI/MVVM), Jetpack Compose, Kotlin Flow/Coroutines, offline Room DB, WorkManager, LeakCanary, R8 shrinking, Play Store release. |
| **[desktop-app-engineering](file:///c:/Users/Hp/code/.agents/skills/desktop-app-engineering/SKILL.md)** | `skills/desktop-app-engineering/` | Cross-platform desktop apps (Tauri 2.0 & Electron), window lifecycles, system tray, code signing (Authenticode & Apple Notarization), NSIS/DMG installers, auto-updaters. |
| **[api-backend-architecture](file:///c:/Users/Hp/code/.agents/skills/api-backend-architecture/SKILL.md)** | `skills/api-backend-architecture/` | Contract-first API design (OpenAPI 3.1 / Protobuf), RFC 7807 problem details, idempotency keys, cursor pagination, rate limiting, circuit breakers, graceful shutdown. |
| **[bot-engineering-security](file:///c:/Users/Hp/code/.agents/skills/bot-engineering-security/SKILL.md)** | `skills/bot-engineering-security/` | Telegram bots (webhooks, `X-Telegram-Bot-Api-Secret-Token`, FSM), Discord bots (slash commands, Ed25519 HTTP verification, 3s deferral rule, sharding), anti-abuse. |

---

## 🎬 Tier 3: CineCraft AI Specialized Video/Audio NLE Skills

| Domain Skill | Directory | Core Mission |
| :--- | :--- | :--- |
| **[frontend-architecture](file:///c:/Users/Hp/code/.agents/skills/frontend-architecture/SKILL.md)** | `skills/frontend-architecture/` | React 18, TypeScript strict zero-any, Zustand atomic selectors, decoupled Canvas/RAF render loop. |
| **[ui-design-system](file:///c:/Users/Hp/code/.agents/skills/ui-design-system/SKILL.md)** | `skills/ui-design-system/` | Studio-grade NLE dark theme, tokens, tabular timecodes (`HH:MM:SS:FF`), J-K-L shuttle controls, color wheels, audio meters. |
| **[backend-tauri-rust](file:///c:/Users/Hp/code/.agents/skills/backend-tauri-rust/SKILL.md)** | `skills/backend-tauri-rust/` | Tauri 2.0 Rust commands, zero-copy buffer IPC, thread pools, FFmpeg bindings, native `ort` ONNX Runtime. |
| **[storage-database](file:///c:/Users/Hp/code/.agents/skills/storage-database/SKILL.md)** | `skills/storage-database/` | Non-destructive EDL persistence (.cinecraft), SQLite FTS5 & vector embeddings, LRU cache. |
| **[security-hardening](file:///c:/Users/Hp/code/.agents/skills/security-hardening/SKILL.md)** | `skills/security-hardening/` | Tauri 2.0 capabilities, strict CSP, path traversal prevention, WebGPU VRAM safety. |
| **[network-cloud-sync](file:///c:/Users/Hp/code/.agents/skills/network-cloud-sync/SKILL.md)** | `skills/network-cloud-sync/` | Offline-first mandate, HTTP Range partial streaming, cloud sync & conflict resolution. |
| **[webgpu-render-pipeline](file:///c:/Users/Hp/code/.agents/skills/webgpu-render-pipeline/SKILL.md)** | `skills/webgpu-render-pipeline/` | WGSL shaders, color wheels, 3D LUT tetrahedral interpolation, scopes, render graph. |
| **[audio-dsp-engine](file:///c:/Users/Hp/code/.agents/skills/audio-dsp-engine/SKILL.md)** | `skills/audio-dsp-engine/` | Audio master clock (Invariant 4), micro-crossfades on cut seams, ITU-R BS.1770-4 LUFS. |
| **[ai-perception-ml](file:///c:/Users/Hp/code/.agents/skills/ai-perception-ml/SKILL.md)** | `skills/ai-perception-ml/` | Whisper ASR, word alignment, Silero VAD, SAM 2 object tracking, Kalman auto-reframe. |
| **[export-hardware-pipeline](file:///c:/Users/Hp/code/.agents/skills/export-hardware-pipeline/SKILL.md)**| `skills/export-hardware-pipeline/`| Hardware encoder detection (NVENC, QSV, VideoToolbox), FFmpeg pipe export (Phase R8). |
| **[project-mapping-docs](file:///c:/Users/Hp/code/.agents/skills/project-mapping-docs/SKILL.md)** | `skills/project-mapping-docs/` | Canonical docs ontology, 7 non-negotiable engineering invariants, mechanical gates. |

---

## 🚀 How to Export to Other Projects

To equip any repository with these master skills:
```bash
# Simply copy the .agents folder into any project root:
cp -r c:\Users\Hp\code\.agents <path-to-your-other-project>\.agents
```
Any AI agent running Antigravity, Claude Code, Cursor, or OpenHands will instantly discover and apply these master production runbooks!
