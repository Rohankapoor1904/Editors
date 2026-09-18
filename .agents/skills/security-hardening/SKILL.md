---
name: security-hardening
description: >-
  Security hardening and defense-in-depth protocols for CineCraft AI.
  Use when configuring Tauri 2.0 permissions, Content Security Policy (CSP),
  path traversal prevention, IPC validation, and WebGPU VRAM memory safety.
---

# Security Hardening & Defense-in-Depth: CineCraft AI

This skill enforces enterprise-grade security across the desktop frontend, IPC bridge, native Rust layer, and GPU memory subsystem.

## 1. Tauri 2.0 Capabilities & Principle of Least Privilege

1. **Explicit IPC Scopes**:
   - In Tauri 2.0, no command is accessible to the frontend by default.
   - Define exact window capabilities in `src-tauri/capabilities/main.json`:
     ```json
     {
       "$schema": "../gen/schemas/desktop-schema.json",
       "identifier": "main-capability",
       "description": "Permissions for the primary video editor window",
       "windows": ["main"],
       "permissions": [
         "core:default",
         "fs:allow-read-file",
         "fs:allow-write-file"
       ]
     }
     ```

2. **Input Validation on Every Command**:
   - Treat all frontend arguments as untrusted.
   - Prevent Path Traversal (`../` attacks): Always canonicalize paths in Rust and ensure they reside within allowed directories:
     ```rust
     let canonical_path = std::fs::canonicalize(&untrusted_path)
         .map_err(|e| format!("Invalid path: {}", e))?;
     ```

## 2. Content Security Policy (CSP)

Maintain a rigid CSP in `src-tauri/tauri.conf.json` to prevent XSS and arbitrary code execution:

```json
{
  "app": {
    "security": {
      "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' asset: blob: data:; media-src 'self' asset: blob:; connect-src 'self' ipc: http://ipc.localhost;"
    }
  }
}
```
- **Self-Host Everything**: Never load scripts, styles, or fonts from external CDNs (no unpkg, cdnjs, etc.).
- **Asset Protocol**: Local media files must be loaded via Tauri's authenticated `asset://` custom protocol.

## 3. WebGPU VRAM Memory Safety (Invariant 6)

1. **Zero-Copy Frame Lifetime & RAII**:
   - Every `VideoFrame` created during demuxing or WebCodecs processing must be closed immediately after rendering:
     ```typescript
     try {
       renderer.renderFrame(videoFrame);
     } finally {
       videoFrame.close(); // Mandatory RAII release
     }
     ```
   - Unreleased frames will exhaust GPU VRAM in seconds, freezing the operating system compositor.

2. **Texture Pool Budgeting**:
   - Use the VRAM texture pool (`src/engine/vramPool.ts`) to reuse intermediate render targets rather than allocating new `GPUTexture` instances every frame.
   - Enforce an upper VRAM budget limit (e.g. 1.5 GB) with emergency texture eviction.

## 4. Auditing & Dependency Hygiene

Regularly run vulnerability checks in CI:
```bash
npm audit --audit-level=high
cd src-tauri && cargo audit
```
Ensure all binary assets (ONNX models, FFmpeg binaries) have verifiable SHA-256 checksums before loading.
