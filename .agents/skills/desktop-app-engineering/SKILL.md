---
name: desktop-app-engineering
description: >-
  Production engineering for cross-platform desktop applications (Tauri 2.0, Electron).
  Use when designing desktop architectures, window lifecycles, system tray integration,
  code signing (Windows Authenticode, macOS Notarization), installers (NSIS, MSI, DMG), and auto-updaters.
---

# Master Playbook: Desktop Application Engineering (Tauri 2.0 & Electron)

This skill covers the end-to-end architecture, native OS integration, and packaging lifecycle for production desktop applications on Windows, macOS, and Linux.

---

## 1. Architectural Model & Memory Boundaries

Desktop applications operate across two distinct process tiers:
1. **Frontend WebView Layer**: Renders UI via HTML5/Canvas/WebGPU. Untrusted sandbox.
2. **Native Host Layer (Rust/Node)**: Direct access to filesystem, hardware encoders, native APIs, and system memory.

### Safety Protocols:
- **Zero-Copy IPC**: For high-throughput desktop apps (video, audio, 3D), avoid serializing large binary payloads over JSON/Base64. Stream raw byte buffers via typed array IPC or memory-mapped files.
- **Background Worker Threads**: Heavy compute (video demuxing, compilation, cryptography) must run on a worker thread pool (`tokio` / `rayon` / Node worker threads), never blocking the OS UI event pump.

---

## 2. Native OS Integrations

- **System Tray & Menus**:
  - Provide a responsive system tray icon with quick actions (Pause, Resume, Status, Quit).
  - Implement standard platform menus: `File`, `Edit`, `View`, `Window`, `Help` matching OS standards (e.g. `Cmd + ,` for Preferences on macOS).
- **Global Shortcuts**:
  - Register global hotkeys cautiously; always handle conflict detection when another app has registered the shortcut.
- **Single Instance Lock**:
  - Enforce single-instance execution (`tauri-plugin-single-instance`). If a user double-clicks the application while it is already running, focus the existing window and pass command-line arguments (e.g. file to open).

---

## 3. Packaging & Platform Installers

| Platform | Recommended Formats | Tooling |
| :--- | :--- | :--- |
| **Windows** | `NSIS` (.exe installer), `WiX` (.msi enterprise) | Tauri CLI / electron-builder |
| **macOS** | `DMG` (drag-and-drop disk image), `PKG` | `create-dmg` / `codesign` / `notarytool` |
| **Linux** | `AppImage` (standalone portable), `.deb` / `.rpm` | AppImageKit / dpkg |

---

## 4. Code Signing & Operating System Trust

Without cryptographic code signing, operating systems flag desktop apps with alarming warnings (Windows SmartScreen, macOS Gatekeeper):

1. **Windows Authenticode**:
   - Sign binaries and installers with an EV (Extended Validation) or standard OV certificate using `signtool.exe`.
   - Always include an RFC 3161 timestamp URL (e.g. `http://timestamp.digicert.com`) so signatures remain valid after the certificate expires.
2. **macOS Gatekeeper & Apple Notarization**:
   - Enable Hardened Runtime (`--options runtime`).
   - Sign with Developer ID Application certificate.
   - Submit to Apple Notary Service (`xcrun notarytool submit`) and staple the ticket (`xcrun stapler staple`).

---

## 5. Secure Auto-Updater Pipeline

- **Ed25519 Signatures**:
  - Never allow an updater to fetch and execute unsigned binaries from a server.
  - The updater must verify cryptographic Ed25519 signatures embedded in the release manifest before launching the installer.
- **Atomic Swap & Rollback**:
  - Update replacement must be atomic to prevent leaving the user in an unusable partial state if installation is interrupted.
