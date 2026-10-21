---
description: Explore the codebase and produce a step-by-step implementation plan before writing code
argument-hint: <feature or change to plan>
---

Plan this change before implementing it: $ARGUMENTS

1. Use the **planner** agent (or follow its method yourself if subagents are unavailable): read the relevant code, find the patterns to follow, and identify constraints and risks.
2. Present the plan with: goal and definition of done, context with `path:line` references, numbered steps (each with files and how it is verified), tests to add, risks and open questions with proposed defaults.
3. Save the plan to `.rounded/plan.md` as a checklist so it survives long sessions.
4. **Stop and wait for confirmation** before changing any code, unless the user already asked you to proceed.
