#!/bin/bash
sed -i 's/| \*\*R7.4\*\* | Agent | Multimodal perception (VLM) | `todo` | | |/| \*\*R7.4\*\* | Agent | Multimodal perception (VLM) | `blocked` | Jules | VLM interfaces added, but implementation throws NotImplementedError because on-device vision encoder needs Rust setup. |/g' PROGRESS.md
