import sys

log_entry = """
## 2024-05-24 — jules — R6.7
- **Did:** Implemented kinetic captions using a WGSL shader simulated block in `src/engine/shaders/caption.wgsl` and a caption engine class in `src/engine/captions/captionEngine.ts`. Connected to `webgpuRenderer.ts` through uniforms (`activeWordIndex`, `timecode`, `wordCount`) and passed through `ProgramMonitor.tsx`. In `live` mode, the `captionEngine` correctly throws a `NotImplementedError` per strict invariants. Added test cases in `__tests__/engine/captionEngine.test.ts`.
- **Verified:** `npm run build`, `npm run test`, and `npm run lint` pass successfully. Tests assert on stub throwing.
- **Left undone:** True text rendering via HarfBuzz/FreeType (as noted in roadmap). The current shader acts as a placeholder visual block over the designated caption area.
- **Next:** Proceed to R6.8 (Neural voice isolation).
- **Blockers:** None.
"""

try:
    with open('docs/WORKLOG.md', 'r') as f:
        content = f.read()
except FileNotFoundError:
    content = ""

header_end = content.find("##")
if header_end != -1:
    new_content = content[:header_end] + log_entry + "\n" + content[header_end:]
else:
    new_content = content + "\n" + log_entry

with open('docs/WORKLOG.md', 'w') as f:
    f.write(new_content)
