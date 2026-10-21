---
name: context-management
description: Keeping long AI-assisted coding sessions focused and recoverable — writing plans and handoff notes, checkpointing progress, choosing what to read, when to compact or start fresh, and delegating to subagents. Use for multi-step tasks, long sessions, or when work must continue in a new session.
---

# Context management for agent sessions

An agent's context window is working memory. Fill it with what matters for the current step, and write down what must survive.

## Plan in a file

For anything longer than a few steps, write the plan to a file (for example `.rounded/plan.md`) with a checklist. Update it as steps complete. The plan survives compaction, restarts and handoffs; the conversation does not.

## Read deliberately

- Search before reading: `grep`/`glob` for the symbol, then open the relevant range, not whole large files.
- Summarise what you learned from exploration in a few lines and drop the details.
- Prefer one targeted test run over dumping full logs; filter output to failures.

## Checkpoint

At natural boundaries (a step done, tests green):
1. Commit the work with a clear message.
2. Update the plan checklist.
3. If the session may end, write a handoff note (`.rounded/handoff.md`): goal, what is done, what is in progress, next steps, open questions, commands to verify.

Rounded's session hooks show the handoff note at the start of the next session.

## Compaction and fresh starts

- Compact or start a new session when the context is full of finished exploration, failed attempts or long outputs.
- Before compacting, make sure the plan and handoff note are current; afterwards, re-read them first.
- Start fresh when switching to an unrelated task.

## Delegate

Use subagents for self-contained work with a clear deliverable: a codebase search, a review, a test run with diagnosis. Give them the goal, the constraints and the expected output format; take back only the conclusion.

## Avoid

- Re-reading the same large files repeatedly.
- Keeping failed approaches in the active plan; note them in one line ("tried X, fails because Y") and move on.
- Long sessions without commits: a crash or wrong turn then costs everything.
