# Notes from the migration review

A running record of decisions and loose ends. Updated 2026-03-14.

## Agenda

1. Data model
2. Rollout
3. Follow-ups

## Decisions

- **Storage**
  - Keep the existing SQLite database
    - One file per workspace
    - WAL mode enabled
  - Move exports to a separate directory
    - `exports/csv/`
    - `exports/pdf/`
- **Transport**
  - WebSocket for live updates
  - Batching window: 50 ms

## Checklist

- [x] Freeze the schema
- [x] Back up production
- [ ] Run the dry-run import
- [ ] Verify row counts
  - [ ] Users table
  - [ ] Documents table
- [X] Publish the rollback plan

> **Risk:** the import touches a table without a primary key.
> Plan for a full copy before the first write.
>
> > Nested quote: keep the old table until a week after cutover.

## Open questions

- Does the batch worker retry on 5xx? [1]
- Which timezone do the reports use? [2]
- Is the archive readable by the desktop client? [1]

## Footnote-like references

[1]: See `src/importer/retry.ts` for the current behaviour.
[2]: The reporting service defaults to UTC.
