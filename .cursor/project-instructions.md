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
