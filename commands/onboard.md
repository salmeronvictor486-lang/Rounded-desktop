---
description: Map an unfamiliar codebase and write a concise orientation guide
argument-hint: [optional focus area]
---

Produce an orientation guide for this repository. Focus: $ARGUMENTS (if empty: the whole project)

1. Identify the stack, build system, entry points, main modules, data stores, external services and deployment setup from manifests, configuration and directory structure.
2. Find how to install, run, test and lint, and try the commands that are safe to run.
3. Trace one representative request or command end to end.
4. Write the guide (show it, and save it to `.rounded/onboarding.md` if the user agrees) with: overview, architecture map (modules and responsibilities), key flows with `path:line`, how to run and test, conventions observed in the code, and pitfalls or areas that look fragile.
