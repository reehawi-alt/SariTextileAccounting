CRITICAL GOVERNANCE & SAFETY RULES

(Must be strictly enforced at all times)

1. CHANGE-SAFETY & WORKFLOW PROTECTION

Any new feature, modification, or refactor must not break or alter existing workflows.

Before implementing any change, the system must explicitly analyze:

Which existing modules are affected

Whether database schemas, calculations, or reports are impacted

Whether historical data integrity is preserved

If a requested change risks:

Breaking accounting logic

Altering financial calculations

Changing report outputs

Invalidating past records
The agent must stop and warn the user before proceeding.

2. NO SILENT ASSUMPTIONS

The agent must never assume intent or fill gaps silently.

If requirements are:

Ambiguous

Incomplete

Conflicting
→ The agent must ask for clarification before implementation.

3. LOGICAL CONSISTENCY VALIDATION (MANDATORY)

If any request:

Violates accounting principles

Conflicts with earlier system rules

Introduces illogical flows (e.g. negative stock, double revenue recognition, invalid currency handling)
The agent must explicitly warn the user and explain:

Why it is incorrect

What risks it introduces

What the correct alternative is

The agent is required to correct misconceptions, not comply with them.

4. DATA INTEGRITY & IMMUTABILITY

Historical accounting records must never be modified or deleted silently.

Any edit to:

Invoices

Payments

Purchases

Stock movements
must:

Be logged

Preserve original values

Create an audit trail (who, when, what changed)

5. VERSIONED EVOLUTION

Every structural change (database, logic, reports) must:

Be backward-compatible OR

Include a migration plan with rollback capability

The agent must recommend:

Versioning strategy

Feature flags where needed

Safe rollout steps

6. EXPLAIN-BEFORE-IMPLEMENT RULE

Before coding any feature, the agent must:

Summarize the intended behavior

List affected modules

Identify risks

Confirm that workflow remains intact

Only after confirmation should implementation proceed.

7. ACCOUNTING-FIRST PRIORITY

When there is a conflict between:

UI convenience

Speed

Simplicity
Accounting correctness always wins.

8. ERROR-PREVENTION OVER ERROR-FIXING

The agent must prefer:

Validation rules

Constraints

Safeguards
over “fixing errors later”.

Prevent invalid data entry at source.

9. NO OVER-ENGINEERING

The agent must not:

Add abstractions without justification

Add features not explicitly requested

Every addition must serve:

Scalability

Maintainability

Auditability

10. TRANSPARENT DECISION LOG

For any non-trivial decision, the agent must explain:

Why this approach was chosen

What alternatives exist

Trade-offs involved

---

## Bulk sale-line catalog repoint (“OPERATION RECORD EDIT 369”)

**Trigger phrase (optional):** user may start with: `CALL OPERATION RECORD EDIT 369` (or “operation 369”) so the agent uses this playbook instead of guessing ranges or consecutive slices.

This documents the **safe** pattern used for repointing specific **sale** lines from one catalog item to another (e.g. wrong item code on selected invoices only).

### What to collect from the user

1. **Market** — name as in `markets` (e.g. `TANZANYA ( YASSER ) `) or `market_id` after confirming in DB.
2. **Source and target items** — `items.id` or exact `items.code` in that market (and supplier if codes repeat).
3. **Exact line list** — for each row: `invoice_number`, `quantity`, `total_price` (invoice currency line total). Optionally `date` for human cross-check only; matching is **not** by date alone.
4. **Control totals** — user should state: number of lines, sum of quantities, sum of line totals (e.g. TZS); the script must **assert** these before `commit`.

### Algorithm (required)

- Resolve `Sale` by `market_id` + `invoice_number` for each row.
- Find the `SaleItem` to change by matching **both** `quantity` and `total_price` to the table (plus existing `item_id` = old item when ambiguous). Use a small money tolerance only if needed (e.g. ±0.5 on total).
- **Do not** update lines on the same invoice that are not in the table (some invoices have two lines with the same catalog item id at different prices).
- Update: `sale_items.item_id` → new item; if `line_description` contains the old code string, replace with the new code string.
- **Abort** with a clear error if any row cannot be matched exactly (no partial commits).

### After the update

- Re-verify by re-querying: for each `(invoice, qty, total)` in the table, exactly one `SaleItem` exists with `item_id` = new item and matching amounts; control totals must match.
- **FIFO note:** `sale_item_allocations` may still reference batches tied to the **old** item; display and invoice lines follow the new item, but COGS/FIFO consistency may need a separate review.

### Implementation template

- Maintain a **one-off script** under `scripts/` (e.g. `scripts/update_hard_toys_45_lines.py`) with: `EXPECTED = [(invoice, qty, total), ...]`, `sys.path` to project root, pre-commit asserts, and transactional `commit` only on full success. Reuse/copy that file per batch and change the tuples + item ids + codes.
