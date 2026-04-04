# PR State Machine & Automation Framework

Comprehensive documentation for the PR Manager's state machine and automation capabilities.

## Overview

This framework provides a complete mapping of all states a PR goes through from creation to merge/close, along with automated response strategies for each state. The system can automatically fix issues, suggest actions to maintainers, or flag items that require manual intervention.

## Architecture

The automation framework consists of three main components:

### 1. **State Machine** (`pr-state-transitions.ts`)
Defines 19 detailed PR states, much more granular than the 8 buckets used for UI display. Each state includes:
- Description and triggers
- Automated actions that can be taken
- Flags for maintainer attention
- Possible transitions to other states

### 2. **Automation Decision Engine** (`automation-engine.ts`)
Uses pattern matching and complexity assessment to decide whether to:
- **AUTO**: Fully automate without approval (low-risk, simple fixes)
- **SUGGEST**: Suggest action with one-click approval (medium-risk)
- **FLAG**: Flag for manual review (high complexity)
- **MANUAL**: Always requires human intervention

### 3. **Worktree Agent Integration** (`worktree-agent.ts`)
Scaffolding for integrating with CLI-based agents (Claude Code, GitHub Copilot) to execute automated fixes via worktree operations.

## State Flow

### Draft Phase
```
DRAFT_INITIAL → DRAFT_IN_PROGRESS → (marked ready) → CHECKS_PASSED_NO_REVIEW
```

**Automated Actions:**
- Welcome message with draft workflow tips
- Suggest marking ready when CI passes
- Flag stale drafts (>14 days)

### Pre-Review Phase
```
WAITING_FOR_CHECKS_INITIAL → CHECKS_PASSED_NO_REVIEW → CHECKS_PASSED_AWAITING_REVIEW
                          ↓
                    CHECKS_FAILED
```

**Automated Actions:**
- Auto-fix common CI failures (lint, format)
- Auto-assign reviewers from CODEOWNERS
- Notify author of failures
- Flag stuck checks (>1 hour)

### Review Phase
```
CHECKS_PASSED_AWAITING_REVIEW → UNDER_REVIEW → REVIEW_APPROVED_CHECKS_PASSED
                                              ↓
                                        REVIEW_CHANGES_REQUESTED
                                              ↓
                                        REVIEW_COMMENTS_UNRESOLVED
```

**Automated Actions:**
- Auto-address simple review feedback (typos, formatting)
- Remind to resolve comment threads
- Ping reviewers if no response (>24h)
- Flag conflicting review feedback

### Merge Preparation Phase
```
REVIEW_APPROVED_CHECKS_PASSED → UPDATE_BRANCH_REQUIRED → READY_TO_MERGE
                              ↓
                        MERGE_CONFLICTS
```

**Automated Actions:**
- Auto-update branch from base
- Auto-resolve lock file conflicts
- Suggest conflict resolution for simple cases
- Auto-merge for trivial approved PRs

### Terminal States
```
READY_TO_MERGE → MERGED
              ↓
            CLOSED
              ↓
            STALE (after 30 days)
```

**Automated Actions:**
- Thank contributors on merge
- Add/remove labels
- Auto-close stale PRs after warning

## Complexity Assessment

The system assesses PR complexity on 5 levels to determine automation safety:

| Level | Criteria | Automation Approach |
|-------|----------|---------------------|
| **TRIVIAL** | <10 changes, ≤2 files | Full automation OK |
| **SIMPLE** | <50 changes, ≤5 files | Automation with patterns |
| **MODERATE** | <200 changes, ≤15 files | Suggest only |
| **COMPLEX** | <500 changes, ≤30 files | Flag for review |
| **CRITICAL** | ≥500 changes, >30 files, or critical files | Manual only |

## Auto-Fixable Patterns

### CI Failures (AUTO/SUGGEST)
- Lint errors (ESLint, Biome)
- Format check failures (Prettier)
- Unused imports
- Simple type errors (null checks)
- Missing semicolons

### Merge Conflicts (SUGGEST)
- Lock files (package-lock.json, yarn.lock)
- Single file conflicts in simple PRs
- Config files (.prettierrc, .eslintrc)

### Review Feedback (AUTO/SUGGEST)
- Typo fixes
- Variable renames
- Add comments
- Format code
- Remove console.log

## Delegation Strategy

The engine decides whether to delegate to a worktree agent based on:

1. **Risk Assessment**: LOW/MEDIUM/HIGH based on complexity and change type
2. **Pattern Matching**: Does the issue match known auto-fixable patterns?
3. **Historical Success**: (Future) Track success rate of similar fixes
4. **Fallback Actions**: What to do if automation fails

### Delegation Flow

```
Issue Detected
    ↓
Assess Complexity
    ↓
Match Patterns
    ↓
Decide Confidence Level
    ↓
┌─────────────┬───────────────┬──────────────┐
│    AUTO     │   SUGGEST     │     FLAG     │
│             │               │              │
│ Execute     │ Show to user  │ Alert        │
│ immediately │ "Fix with     │ maintainer   │
│             │  one click"   │              │
└─────────────┴───────────────┴──────────────┘
```

## LLM-Based Decision Enhancement

For complex cases, the system can invoke an LLM to make more sophisticated decisions:

```typescript
const prompt = generateDecisionPrompt(action, state, factors);
const decision = await llm.analyze(prompt);
// Returns: confidence, delegation target, risk level, reasoning
```

This is useful when:
- Multiple valid approaches exist
- Context requires deeper understanding
- Historical patterns are ambiguous

## Worktree Agent Integration

### Supported Agents

1. **Claude Code** (Primary)
   - Full file manipulation capabilities
   - Rich context understanding
   - Safe execution with constraints

2. **GitHub Copilot CLI**
   - Quick suggestions
   - GitHub-native integration

3. **Custom Agents**
   - Extensible for future tools

### Agent Invocation

```typescript
const decision = decideAutomation(action, state, factors);
const invocation = createAgentInvocation(decision, prContext, "claude_code");

// Generate CLI command for clipboard
const command = generateCLICommand(invocation);
// User copies and runs in terminal

// OR: Use WebSocket bridge (future)
const bridge = new AgentBridge();
const result = await bridge.invoke(invocation);
```

### Safety Constraints

Agents are constrained based on risk level:

| Risk Level | Max Files | Max Changes | Allowed Tools | Timeout |
|------------|-----------|-------------|---------------|---------|
| LOW | 10 | 200 | Read,Write,Edit,Bash,Grep,Glob | 600s |
| MEDIUM | 5 | 100 | Read,Write,Edit,Grep,Glob | 600s |
| HIGH | Manual only | - | - | - |

## Implementation Examples

### Example 1: Auto-fix CI failure

```typescript
// PR #123 has lint errors
const factors: AutomationDecisionFactors = {
  stateTransition: { from: "CHECKS_FAILED", to: "WAITING_FOR_CHECKS_RERUN" },
  complexityLevel: "SIMPLE",
  changeSize: { additions: 30, deletions: 15, files: 3 },
  failurePattern: {
    type: "CI_FAILURE",
    details: "Lint errors",
    errorMessages: ["eslint: unused import 'React'", "prettier: trailing comma"]
  }
};

const decision = decideAutomation("FIX_CI_FAILURE", "CHECKS_FAILED", factors);
// Result: confidence="AUTO", shouldDelegate=true, risk="LOW"

// Create agent invocation
const invocation = createAgentInvocation(decision, prContext);
// Generates instruction: "Fix lint errors: run lint fix, commit changes"
```

### Example 2: Suggest conflict resolution

```typescript
// PR #456 has merge conflicts
const factors: AutomationDecisionFactors = {
  stateTransition: { from: "REVIEW_APPROVED_CHECKS_PASSED", to: "MERGE_CONFLICTS" },
  complexityLevel: "SIMPLE",
  changeSize: { additions: 50, deletions: 30, files: 5 },
  failurePattern: {
    type: "MERGE_CONFLICT",
    details: "package-lock.json,src/config.ts"
  }
};

const decision = decideAutomation("RESOLVE_CONFLICTS", "MERGE_CONFLICTS", factors);
// Result: confidence="SUGGEST", shouldDelegate=true, risk="MEDIUM"

// Shows user: "Auto-resolve conflicts? [Resolve Now] [Review Manually]"
```

### Example 3: Flag complex review feedback

```typescript
// PR #789 has architectural change request
const factors: AutomationDecisionFactors = {
  stateTransition: { from: "UNDER_REVIEW", to: "REVIEW_CHANGES_REQUESTED" },
  complexityLevel: "COMPLEX",
  changeSize: { additions: 300, deletions: 200, files: 20 },
  failurePattern: {
    type: "REVIEW_FEEDBACK",
    details: "Please refactor to use dependency injection"
  }
};

const decision = decideAutomation("ADDRESS_REVIEW_COMMENTS", "REVIEW_CHANGES_REQUESTED", factors);
// Result: action="POST_COMMENT", delegationTarget="author"
// Will post: "This feedback requires architectural changes - author should address"
```

## Maintainer Flags

The system flags important conditions for maintainer attention:

| Urgency | Examples |
|---------|----------|
| **HIGH** | • CI failure in infrastructure files<br>• Conflicts in schema/migration files<br>• Blocking PR waiting >7 days<br>• Tests failing after approval |
| **MEDIUM** | • Conflicting review feedback<br>• Complex conflicts (>5 files)<br>• Stale approved PR<br>• Review bottleneck >7 days |
| **LOW** | • Stale draft >14 days<br>• Ready PR not merged >7 days |

## Integration with UI

The state machine integrates with the existing bucket system:

```typescript
// Determine detailed state from bucket + context
const detailedState = determineDetailedState(bucket, {
  isDraft,
  statusCheckState,
  reviewDecision,
  mergeable,
  unresolvedThreads,
  hasReviewers,
  updatedAt
});

// Get automation config for this state
const config = PR_STATE_MACHINE[detailedState];

// Display available automated actions
config.automatedActions.forEach(action => {
  if (action.confidence === "AUTO") {
    // Show "Fixing automatically..."
  } else if (action.confidence === "SUGGEST") {
    // Show "[Fix with one click]" button
  }
});
```

## Future Enhancements

### Phase 1 (Current)
- ✅ Complete state machine mapping
- ✅ Automation decision engine
- ✅ Worktree agent scaffolding
- ✅ Comprehensive tests

### Phase 2 (Next)
- [ ] UI components for automation actions
- [ ] WebSocket bridge for local agent communication
- [ ] LLM integration for complex decisions
- [ ] Historical success tracking

### Phase 3 (Future)
- [ ] VS Code extension for seamless CLI integration
- [ ] Multi-PR orchestration (dependency chains)
- [ ] Learning from user feedback (approve/reject suggestions)
- [ ] Custom automation rules per repository

## Testing

Run the comprehensive test suite:

```bash
npm test
```

Test coverage includes:
- **26 tests** for automation engine (complexity, decisions, prompts)
- **26 tests** for state machine (state mapping, transitions, config)
- **20 tests** for worktree agent (instructions, invocations, mock bridge)

All **72 tests** ensure the automation framework works correctly across all states and complexity levels.

## Safety Considerations

1. **Never auto-execute destructive actions** (delete, force push, close PRs)
2. **Always require approval for MEDIUM+ risk** changes
3. **Fail gracefully** with clear error messages
4. **Provide escape hatches** - maintainer can always override
5. **Audit trail** - log all automated actions
6. **Rate limiting** - prevent runaway automation loops

## Conclusion

This automation framework provides a robust foundation for progressively automating PR management while maintaining safety and control. It starts conservative (mostly suggestions) and can become more aggressive as confidence builds through usage and feedback.

The key insight: **automation confidence correlates with pattern recognizability and complexity**. Simple, well-understood issues can be fully automated. Complex, ambiguous issues always require human judgment.
