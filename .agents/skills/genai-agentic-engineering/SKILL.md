---
name: genai-agentic-engineering
description: >-
  Master skill for Generative AI engineering, LLM application architecture, FastMCP, and agentic tools.
  Use when developing agentic ReAct loops, Model Context Protocol (MCP) servers, typed JSON tools,
  vector search embeddings, and evaluation guardrails.
---

# Master Skill: GenAI, Agentic Engineering & MCP Architecture

This skill codifies the principles of production Generative AI engineering and autonomous agent systems, synthesized from `gen-ai-roadmap` and `ai-workspace-archive`.

---

## 1. The ReAct (Reason + Act) Autonomous Loop

A production AI agent does not simply guess actions; it operates through a deterministic, transactional ReAct cycle:

```text
User Request / Event
         │
         ▼
 ┌───────────────┐
 │ 1. Observe    │ ◄── Read system state (timeline, clips, active selection)
 └───────┬───────┘
         │
         ▼
 ┌───────────────┐
 │ 2. Plan       │ ◄── LLM reasons and generates structured tool execution plan
 └───────┬───────┘
         │
         ▼
 ┌───────────────┐
 │ 3. Validate   │ ◄── Check arguments against JSON Schema (reject malformed calls)
 └───────┬───────┘
         │
         ▼
 ┌───────────────┐
 │ 4. Execute    │ ◄── Execute tool via Global Tool Registry
 └───────┬───────┘
         │
         ▼
 ┌───────────────┐
 │ 5. Transaction│ ◄── Wrap all state changes in a single CompoundCommand (atomic undo)
 └───────────────┘
```

---

## 2. Model Context Protocol (MCP) & Typed Tool Design

1. **Strict JSON Schema Contract**:
   - Every tool exposed to an AI agent must define explicit parameter schemas:
     ```typescript
     export interface ToolDefinition {
       name: string;
       description: string;
       parameters: {
         type: 'object';
         properties: Record<string, { type: string; description: string }>;
         required: string[];
       };
       executor: (args: unknown) => Promise<ToolResult>;
     }
     ```
   - Never accept raw unstructured strings when numeric IDs, enums, or RationalTime objects are required.

2. **FastMCP Integration**:
   - For backend tool services (Python / Node.js), use FastMCP to expose local database queries, asset transformations, or file system operations through standard MCP protocol interfaces.

---

## 3. Multimodal Perception & Vector Search

- **Multimodal Embeddings**:
  - Use CLIP / SigLIP vision-language models to embed video keyframes into high-dimensional vector spaces (e.g. 512-dim).
  - Search queries map to the same vector space, enabling semantic natural language search:
    - `"Find the scene where the car turns left at sunset"`
- **Robust Fallbacks**:
  - Always maintain a deterministic fallback (e.g. SQLite FTS5 string matching on transcript labels) when native GPU neural inference is unavailable.

---

## 4. Guardrails & Human-in-the-Loop (HITL)

- **Destructive Action Gating**:
  - Never allow an autonomous agent to execute destructive commands (deleting files, dropping database tables, overwriting master projects) without explicit human confirmation.
- **Loop Bounds**:
  - Bound agent reasoning loops to a maximum iteration threshold (e.g., `MAX_STEPS = 10`) to prevent infinite recursion and token exhaustion.
- **Evaluation (Evals)**:
  - Maintain a test suite of "Golden Prompts" with known expected tool call outputs to continuously measure agent accuracy and regression.
