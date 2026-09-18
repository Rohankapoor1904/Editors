import re

with open('PROGRESS.md', 'r') as f:
    content = f.read()

content = re.sub(
    r'\| R6\.7 \| todo         \|        \|                 \|',
    r'| R6.7 | done         | jules  | 2024-05-24      |',
    content
)

with open('PROGRESS.md', 'w') as f:
    f.write(content)
