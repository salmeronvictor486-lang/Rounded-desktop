---
description: Explain how a piece of code, module or flow works, with references
argument-hint: <file, symbol, feature or question>
---

Explain: $ARGUMENTS

1. Locate the relevant code (search for symbols, routes, configuration) and read it, following calls far enough to answer accurately.
2. Explain at two levels:
   - **Overview:** purpose, inputs and outputs, where it is used, in a short paragraph.
   - **Walkthrough:** the flow step by step, with `path:line` references and the key data structures.
3. Point out non-obvious behaviour: side effects, error handling, concurrency, performance characteristics, security-relevant checks.
4. Say what you could not determine from the code (for example runtime configuration).
5. Do not modify files.
