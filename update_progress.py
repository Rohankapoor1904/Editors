with open('PROGRESS.md', 'r') as f:
    content = f.read()

content = content.replace(
    '| **R8.2** | Export | Encoder capability detection | `todo` | | |',
    '| **R8.2** | Export | Encoder capability detection | `done` | Jules | `npm test` and `cargo check` pass, dynamically detects ffmpeg hardware encoders |'
)

with open('PROGRESS.md', 'w') as f:
    f.write(content)
