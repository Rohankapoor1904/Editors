---
name: mobile-android-production
description: >-
  Production Android and cross-platform mobile development playbook.
  Use when building or auditing Android apps (Kotlin, Jetpack Compose, Flutter, React Native),
  offline-first storage (Room, SQLDelight), background sync, ProGuard/R8, and Play Store release.
---

# Master Playbook: Android & Mobile App Production Engineering

This skill defines the technical standards, architectural patterns, and production checklists required to build robust, high-performance mobile applications.

---

## 1. Modern Architecture: Unidirectional Data Flow (MVI/MVVM)

Every screen must follow clean architecture with unidirectional state flow:

```text
User Event (Click/Swipe)
         │
         ▼
┌──────────────────┐
│   UI (Compose)   │ ◄── Collects UI State from ViewModel (StateFlow)
└────────┬─────────┘
         │ Dispatches Intent / Action
┌────────▼─────────┐
│    ViewModel     │ ◄── Handles business logic & coroutine scopes
└────────┬─────────┘
         │ Calls UseCases / Repository
┌────────▼─────────┐
│    Repository    │ ◄── Single Source of Truth (SSOT)
└────────┬─────────┘
    ┌────┴────────────┐
    ▼                 ▼
Local (Room DB)    Remote (Ktor / Retrofit API)
```

### Core Rules:
1. **Never leak UI State**: UI components must be passive. They only render `StateFlow<UiState>` and emit events.
2. **Lifecycle-Aware Coroutines**: Always use `repeatOnLifecycle(Lifecycle.State.STARTED)` or `collectAsStateWithLifecycle()` in Compose to prevent background execution battery drain.
3. **Dependency Injection**: Use Hilt or Koin for loose coupling and testability.

---

## 2. Offline-First Mandate & Data Persistence

1. **Room / SQLDelight as SSOT**:
   - The UI reads exclusively from the local database.
   - Network fetches update the local database; database changes automatically trigger UI updates via Flow.
2. **Resilient Background Work**:
   - Use Android `WorkManager` for guaranteed background tasks (asset uploads, syncing).
   - Configure constraints: `NetworkType.CONNECTED`, `RequiresBatteryNotLow`.
   - Implement exponential backoff for retries.

---

## 3. Performance & Memory Management

- **Compose Recomposition Optimization**:
  - Mark immutable data classes with `@Immutable` or `@Stable`.
  - Use `remember` and `derivedStateOf` for expensive computations to avoid recomposing on every frame.
- **Memory Leaks**:
  - Integrate `LeakCanary` in debug builds.
  - Never hold strong references to `Activity` or `Context` inside singletons, coroutines, or background threads.
- **Image Loading**:
  - Use `Coil` or `Glide` with automatic memory caching and downsampling to prevent OutOfMemory (OOM) crashes.

---

## 4. Security & Hardening

- **Encrypted Storage**: Store authentication tokens and sensitive credentials in `EncryptedSharedPreferences` backed by the Android Keystore system.
- **Certificate Pinning**: Pin SSL certificates in OkHttp/Ktor for sensitive financial or personal data endpoints.
- **Root & Tamper Detection**: Guard against reverse-engineering and rooted environments if required.

---

## 5. Play Store Release Checklist

- [ ] Enable R8 code shrinking and resource obfuscation in `build.gradle.kts`:
  ```kotlin
  isMinifyEnabled = true
  isShrinkResources = true
  proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
  ```
- [ ] Generate Android App Bundle (`.aab`), signed with a secure upload key stored outside the repository.
- [ ] Configure `targetSdkVersion` to the latest Google Play requirement.
- [ ] Provide clear runtime permission requests (`ActivityResultContracts.RequestPermission`) with contextual rationale dialogs.
