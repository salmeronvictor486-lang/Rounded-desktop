---
description: Save progress — commit finished work and write a handoff note for the next session
argument-hint: [optional note about what to do next]
---

Create a checkpoint. Extra note from the user: $ARGUMENTS

1. Run the tests relevant to the work in progress.
2. If the work is in a coherent, passing state, propose a commit (Conventional Commits message) and commit it if the user has allowed commits in this session.
3. Write or update `.rounded/handoff.md` with:
   - **Goal** (one paragraph)
   - **Done** (bullets, with commits)
   - **In progress** (what is half-finished and where)
   - **Next steps** (ordered)
   - **Open questions / decisions made**
   - **How to verify** (commands)
4. Update the checklist in `.rounded/plan.md` if it exists.
5. Suggest adding `.rounded/` to `.gitignore` if it is not ignored and the user does not want to share these notes.

The Rounded session-start hook shows this note at the beginning of the next session.
