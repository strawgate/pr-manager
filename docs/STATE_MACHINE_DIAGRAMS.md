# PR State Machine Visual Flow

> **⚠️ DESIGN DOCUMENT**: These diagrams represent the **planned architecture** for PR automation. The underlying logic is fully implemented and tested, but UI integration is pending. See `PR_STATE_MACHINE.md` for implementation status.

## Complete State Transition Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PR LIFECYCLE STATES                                │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐
│   DRAFT_INITIAL      │  ← PR created as draft
│                      │  → Welcome message
└──────────┬───────────┘
           │ Commits pushed
           ↓
┌──────────────────────┐
│  DRAFT_IN_PROGRESS   │  ← Active draft work
│                      │  → Suggest marking ready (if CI passes)
└──────────┬───────────┘  → Flag stale (>14 days)
           │ Marked ready for review
           ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│                          CHECK & REVIEW PHASE                                 │
└──────────────────────────────────────────────────────────────────────────────┘

           ┌──────────────────────┐
           │ WAITING_FOR_CHECKS_  │  ← First CI run
           │      INITIAL         │  → Status updates
           └──────┬───────────────┘
                  │
         ┌────────┴────────┐
         │                 │
    CI Pass          CI Fail
         │                 │
         ↓                 ↓
┌────────────────┐   ┌────────────────┐
│ CHECKS_PASSED_ │   │ CHECKS_FAILED  │  ← CI failures
│   NO_REVIEW    │   │                │  → AUTO-FIX (lint/format)
└────┬───────────┘   └────┬───────────┘  → Comment with help
     │                    │               → Flag persistent failures
     │ Reviewers          │ New commits
     │ assigned           │ pushed
     ↓                    ↓
┌────────────────┐   ┌────────────────┐
│ CHECKS_PASSED_ │   │ WAITING_FOR_   │  ← Checks rerunning
│   AWAITING_    │   │ CHECKS_RERUN   │
│    REVIEW      │   └────────────────┘
└────┬───────────┘
     │ Review starts
     ↓
┌────────────────┐
│  UNDER_REVIEW  │  ← Review in progress
└────┬───────────┘
     │
     ├─────────────────────┬──────────────────────┐
     │                     │                      │
  Approved          Changes Requested      Comments Added
     │                     │                      │
     ↓                     ↓                      ↓
┌────────────────┐   ┌────────────────┐   ┌───────────────┐
│ REVIEW_        │   │ REVIEW_CHANGES │   │ REVIEW_       │
│ APPROVED_      │   │   _REQUESTED   │   │ COMMENTS_     │
│ CHECKS_PASSED  │   │                │   │ UNRESOLVED    │
└────┬───────────┘   └────┬───────────┘   └───┬───────────┘
     │                    │                    │
     │                    │ → AUTO-ADDRESS     │ → Remind to
     │                    │   (typos/format)   │   resolve
     │                    │                    │
     │                    └────────────────────┘
     │                            │
     │                    New commits pushed
     │                            │
     ↓                            ↓
┌──────────────────────────────────────────────────────────────┐
│                    MERGE PREPARATION PHASE                    │
└──────────────────────────────────────────────────────────────┘

┌────────────────────┐
│ REVIEW_APPROVED_   │  ← All checks passed
│   CHECKS_PASSED    │    & approved
└────┬───────────────┘
     │
     ├──────────────────────┬──────────────────┐
     │                      │                  │
Base ahead          All current      Conflicts detected
     │                      │                  │
     ↓                      ↓                  ↓
┌────────────────┐   ┌────────────┐    ┌──────────────┐
│ UPDATE_BRANCH_ │   │  READY_TO  │    │   MERGE_     │
│   REQUIRED     │   │   MERGE    │    │  CONFLICTS   │
│                │   │            │    │              │
│ → AUTO-UPDATE  │   │ → AUTO-    │    │ → SUGGEST    │
│   BRANCH       │   │   MERGE    │    │   RESOLUTION │
└────────────────┘   │   (trivial)│    │   (simple)   │
                     └────────────┘    └──────────────┘
                           │                   │
                           │                   │ Conflicts
                           │                   │ resolved
                           │                   │
                           ↓                   ↓
                     ┌────────────┐     ┌──────────────┐
                     │  MERGED    │     │ WAITING_FOR_ │
                     │            │     │CHECKS_RERUN  │
                     │ → Thank    │     └──────────────┘
                     │   contributors
                     └────────────┘

┌──────────────────────────────────────────────────────────────┐
│                      TERMINAL & EDGE STATES                   │
└──────────────────────────────────────────────────────────────┘

┌────────────────┐
│    CLOSED      │  ← Closed without merge
│                │  → Ask for reason
└────────────────┘

┌────────────────┐
│     STALE      │  ← No activity >30 days
│                │  → Warning comment
│                │  → AUTO-CLOSE after 7 days
└────────────────┘
```

## Automation Decision Tree

```
┌─────────────────────────────────────────────────────────────────┐
│                  AUTOMATION DECISION FLOW                        │
└─────────────────────────────────────────────────────────────────┘

                    Issue Detected
                          │
                          ↓
              ┌───────────────────────┐
              │  Assess Complexity    │
              │  - Change size        │
              │  - File count         │
              │  - Critical files     │
              └───────────┬───────────┘
                          │
                          ↓
              ┌───────────────────────┐
              │  Pattern Matching     │
              │  - Auto-fixable?      │
              │  - Known solution?    │
              │  - Historical data    │
              └───────────┬───────────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                │
    TRIVIAL/SIMPLE    MODERATE        COMPLEX/CRITICAL
         │                │                │
         ↓                ↓                ↓
    ┌─────────┐      ┌─────────┐     ┌─────────┐
    │  AUTO   │      │ SUGGEST │     │  FLAG   │
    │         │      │         │     │   or    │
    │ Execute │      │ Show    │     │ MANUAL  │
    │ now     │      │ button  │     │         │
    └─────────┘      └─────────┘     └─────────┘
         │                │                │
         ↓                ↓                ↓
    Delegate to      User clicks     Notify
    worktree agent   to approve      maintainer
         │                │                │
         ↓                ↓                ↓
    ┌─────────────────────────────────────────┐
    │         Execute with Constraints         │
    │  - Max files based on risk               │
    │  - Max changes based on risk             │
    │  - Allowed tools based on risk           │
    │  - Timeout limits                        │
    └─────────────────────────────────────────┘
```

## Risk Assessment Matrix

```
┌─────────────────────────────────────────────────────────────────────┐
│                      COMPLEXITY vs AUTOMATION                        │
└─────────────────────────────────────────────────────────────────────┘

Complexity ↑
           │
  CRITICAL │ ╔═══════╗
           │ ║MANUAL ║  Manual only - too risky
           │ ║ ONLY  ║
           │ ╚═══════╝
           │
   COMPLEX │ ┌───────┬───────┐
           │ │ FLAG  │ FLAG  │  Flag for review
           │ │  FOR  │  FOR  │
           │ └───────┴───────┘
           │
  MODERATE │ ┌───────┬───────┬───────┐
           │ │SUGGEST│SUGGEST│ FLAG  │  Suggest with approval
           │ │       │       │       │
           │ └───────┴───────┴───────┘
           │
    SIMPLE │ ┌───────┬───────┬───────┬───────┐
           │ │ AUTO  │SUGGEST│SUGGEST│ FLAG  │  Auto or suggest
           │ │       │       │       │       │
           │ └───────┴───────┴───────┴───────┘
           │
   TRIVIAL │ ┌───────┬───────┬───────┬───────┬───────┐
           │ │ AUTO  │ AUTO  │SUGGEST│SUGGEST│ FLAG  │  Full automation
           │ │       │       │       │       │       │
           │ └───────┴───────┴───────┴───────┴───────┘
           └──────────────────────────────────────────────→
             100%    75%     50%     25%     0%
                    Pattern Match Confidence

Legend:
  ╔═══╗
  ║   ║  MANUAL - Always requires human
  ╚═══╝

  ┌───┐
  │   │  FLAG - Alert maintainer, no automation
  └───┘

  ┌───┐
  │   │  SUGGEST - Show "fix with one click" button
  └───┘

  ┌───┐
  │   │  AUTO - Execute immediately
  └───┘
```

## Action Flow Examples

### Example 1: CI Failure → Auto-Fix

```
PR #123: Lint errors detected
│
├─ Complexity: SIMPLE (30 adds, 15 dels, 3 files)
├─ Pattern: "eslint: unused import", "prettier: trailing comma"
├─ Match: 100% auto-fixable
│
└─→ Decision: AUTO
    │
    ├─ Risk: LOW
    ├─ Delegate to: worktree_agent
    ├─ Constraints: maxFiles=10, maxChanges=200
    │
    └─→ CLI Command:
        claude -p "Fix lint errors in PR #123:
          - Run eslint --fix
          - Run prettier --write
          - Commit with 'fix: address CI failures'"
        │
        └─→ Result: ✓ Fixed, tests pass, committed
```

### Example 2: Merge Conflict → Suggest Resolution

```
PR #456: Conflicts in package-lock.json, src/config.ts
│
├─ Complexity: SIMPLE (50 adds, 30 dels, 5 files)
├─ Pattern: Lock file (100% auto) + code file (50% auto)
├─ Match: 75% confidence
│
└─→ Decision: SUGGEST
    │
    ├─ Risk: MEDIUM
    ├─ UI: [Auto-resolve conflicts] [Review manually]
    │
    └─→ User clicks [Auto-resolve conflicts]
        │
        ├─ Delegate to: worktree_agent
        ├─ Constraints: maxFiles=5, maxChanges=100
        │
        └─→ CLI Command:
            claude -p "Resolve conflicts in PR #456:
              1. Regenerate package-lock.json
              2. Carefully merge src/config.ts
              3. Run tests, commit if passing"
            │
            └─→ Result: ✓ Conflicts resolved, awaiting checks
```

### Example 3: Complex Feedback → Flag

```
PR #789: "Please refactor to use dependency injection"
│
├─ Complexity: COMPLEX (300 adds, 200 dels, 20 files)
├─ Pattern: No match (architectural change)
├─ Match: 0% confidence
│
└─→ Decision: FLAG
    │
    ├─ Action: POST_COMMENT
    ├─ Target: author + maintainer
    │
    └─→ Comment:
        "⚠️ This review feedback requires architectural changes.

         The request to refactor for dependency injection is complex
         and requires design decisions. Author should address this
         manually or discuss with the reviewer for clarification.

         Maintainer: This PR is flagged for your attention."
```

## State-to-UI Mapping

```
┌──────────────────────┬─────────────┬─────────────────────────┐
│ State                │ Bucket      │ UI Actions Available     │
├──────────────────────┼─────────────┼─────────────────────────┤
│ DRAFT_IN_PROGRESS    │ DRAFT       │ [Mark ready]             │
├──────────────────────┼─────────────┼─────────────────────────┤
│ CHECKS_FAILED        │ WAITING_ON_ │ [Auto-fix] [View logs]   │
│                      │ CI          │                          │
├──────────────────────┼─────────────┼─────────────────────────┤
│ CHECKS_PASSED_NO_    │ NEEDS_      │ [Request review]         │
│ REVIEW               │ REVIEW      │                          │
├──────────────────────┼─────────────┼─────────────────────────┤
│ REVIEW_CHANGES_      │ CHANGES_    │ [Auto-address] [/ai]     │
│ REQUESTED            │ REQUESTED   │ [@copilot]               │
├──────────────────────┼─────────────┼─────────────────────────┤
│ MERGE_CONFLICTS      │ HAS_        │ [Auto-resolve] [Clone]   │
│                      │ CONFLICTS   │                          │
├──────────────────────┼─────────────┼─────────────────────────┤
│ READY_TO_MERGE       │ READY_TO_   │ [Merge now] [Schedule]   │
│                      │ MERGE       │                          │
└──────────────────────┴─────────────┴─────────────────────────┘
```

## Maintainer Dashboard View

```
┌──────────────────────────────────────────────────────────────┐
│                    PR MANAGER DASHBOARD                       │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  🚨 High Priority (3)                                         │
│  ├─ PR #125: Test failures after approval        [Review]    │
│  ├─ PR #203: Conflicts in migration files        [Manual]    │
│  └─ PR #456: Blocking other PRs (7 days)         [Escalate]  │
│                                                               │
│  ⚠️  Needs Attention (5)                                      │
│  ├─ PR #789: Conflicting review feedback         [Align]     │
│  ├─ PR #234: Stale approved PR                   [Ping]      │
│  └─ ... (3 more)                                             │
│                                                               │
│  ✅ Auto-Fixed Today (12)                                     │
│  ├─ PR #123: Lint errors fixed                   [View]      │
│  ├─ PR #156: Lock file conflicts resolved        [View]      │
│  └─ ... (10 more)                                            │
│                                                               │
│  🤖 Pending Approval (4)                                      │
│  ├─ PR #345: Resolve conflicts?      [Approve] [Reject]      │
│  ├─ PR #567: Address review feedback [Approve] [Reject]      │
│  └─ ... (2 more)                                             │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

## Statistics & Metrics

Track automation effectiveness:

```
┌──────────────────────────────────────────────────────────────┐
│                   AUTOMATION METRICS                          │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Last 30 Days:                                               │
│                                                               │
│  PRs Auto-Fixed:        47 / 120  (39%)                      │
│  ├─ CI Failures:        32                                   │
│  ├─ Conflicts:          8                                    │
│  └─ Review Feedback:    7                                    │
│                                                               │
│  Suggestions Approved:  28 / 35   (80%)                      │
│  Suggestions Rejected:  7  / 35   (20%)                      │
│                                                               │
│  Time Saved:            ~23.5 hours                          │
│  (Estimated based on 30min avg per manual fix)               │
│                                                               │
│  Top Auto-Fix Patterns:                                      │
│  1. ESLint errors        (18 fixes)                          │
│  2. Prettier formatting  (12 fixes)                          │
│  3. Lock file conflicts  (8 fixes)                           │
│  4. Import organization  (5 fixes)                           │
│  5. Type errors          (4 fixes)                           │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```
