---
name: database-migrations
description: How to change database schemas and data safely in production — expand/contract, zero-downtime patterns, batching backfills, locking pitfalls and rollbacks. Use when writing or reviewing migrations, renaming or removing columns, adding constraints or indexes, or backfilling data.
---

# Database migrations

A migration runs against live data while old and new code may both be running. Design for that.

## Golden rules

1. **Every migration is versioned, reviewed and repeatable** through the project's migration tool. No manual changes in production.
2. **Schema changes and code changes deploy separately** so either can roll back.
3. **Back up (or confirm point-in-time recovery) before destructive changes.**
4. **Test migrations against a copy of production-sized data** to know how long they take and what they lock.

## Expand → migrate → contract

To rename `users.name` to `users.full_name` without downtime:

1. **Expand:** add `full_name` (nullable). Deploy code that writes both columns and reads the old one.
2. **Migrate:** backfill `full_name` in batches. Deploy code that reads `full_name`.
3. **Contract:** after all running code uses `full_name`, stop writing `name`, then drop it in a later release.

The same pattern covers changing types, splitting tables and moving data between services.

## Operations that lock or break (PostgreSQL examples; check your engine)

| Risky | Safer |
|---|---|
| `CREATE INDEX` on a big table | `CREATE INDEX CONCURRENTLY` (outside a transaction) |
| `ADD COLUMN ... NOT NULL` without default on old versions | add nullable, backfill, then `SET NOT NULL` (or add a `CHECK ... NOT VALID` then validate) |
| `ADD FOREIGN KEY` | add with `NOT VALID`, then `VALIDATE CONSTRAINT` separately |
| changing a column type | new column + backfill + switch |
| renaming a column or table in use | expand/contract |
| long-running migration holding locks | set `lock_timeout` and `statement_timeout`; retry |

MySQL: prefer online DDL (`ALGORITHM=INPLACE/INSTANT`) or tools such as gh-ost/pt-online-schema-change for large tables.

## Backfills

- Process in batches (for example 1,000–10,000 rows) by primary key range, committing each batch.
- Make them resumable and idempotent (`WHERE new_col IS NULL`).
- Throttle to protect production load; log progress.
- Run as a separate job, not inside the schema migration.

## Rollback

- Write the down migration when it is possible and safe; otherwise document the manual recovery steps.
- A rollback that drops data is not a rollback. Prefer roll-forward fixes after the contract step.

## Review checklist

- [ ] Works while the previous code version is still running
- [ ] Locks understood and bounded
- [ ] Batching for anything touching many rows
- [ ] Indexes for new foreign keys and query patterns
- [ ] Constraints match application validation
- [ ] Tested on realistic data volume
