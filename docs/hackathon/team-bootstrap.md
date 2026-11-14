# Hackathon team bootstrap

## Assignment

- Agent 1: current instance; scope, acceptance tests, interface decisions, integration and QA.
- Agent 2: HCN_main; React Native Android UI and crawler adapters.
- Agent 3: mzuyyy; backend, persistence and AI.
- Skill: `.agents/skill/hackathon-agent-skill/SKILL.md` and its role references and collaboration contract.

## Round 1: repository readiness and task breakdown

User requested team assignment. This round produces implementation briefs, not an unbounded product implementation.
Repository: https://github.com/Djuybu/Lua.git
Reference commit: `81014a760948071997679f1afb24e92ab80fda75` (local `dev`).
No `develop` currently exists. No release or branch remapping is performed in this planning round. Implementation must first agree on a common integration base.
Each delegate receives a T3-managed isolated worktree; actual path, branch and SHA must be reported, and any mismatch with the reference commit disclosed.

### BOOT-2 / Agent 2

Read BRD, frontend plans/design context and role/contract. Inventory actual UI/crawler code, identify missing or contradictory documentation, propose ordered UI/crawler tasks with file ownership and acceptance cases. Output a report to Agent 1; no source edits, crawl, commits or pushes this round.

### BOOT-3 / Agent 3

Read BRD, implementation plan, prebuild tests and role/contract. Inventory actual backend/AI code, propose API/crawler schemas and ordered backend/AI tasks with file ownership and acceptance cases. Output a report to Agent 1; no source edits, paid API calls, database operations, commits or pushes this round.

## Acceptance and verification

| Case | Criterion and procedure | Expected evidence | Owner |
|---|---|---|---|
| TC-01 | Verify repo identity and baseline with git remote/status/rev-parse | Remote, SHA, branch, worktree and mismatches reported | Both delegates |
| TC-02 | Read role and shared contract; inspect tracked files | Existing implementation distinguished from plans and stale references | Both delegates |
| TC-03 | Map proposed tasks to BRD and prebuild cases | Task IDs, dependencies, owned paths, acceptance criteria and proposed checks | Both delegates |
| TC-04 | Compare proposed UI/crawler/backend contracts | Open decisions explicitly listed; no incompatible interface assumed approved | Agent 1 |

Status: blocked before delegate creation. Neither child started.

T3 remote delegation rejects worktree isolation; this read-only round may use existing project checkouts instead. Both remote delegates then failed because no registered project matched github.com/djuybu/lua. mzuyyy project listing confirmed no Lua project; HCN_main project listing failed because the machine did not answer. Attempt to clone Lua into D:\Coding\Lua on mzuyyy was rejected with capability_denied: changing projects needs a live full-access/default calling thread or full-access client. No clone or registration was completed. Resume after Lua is registered on both machines and HCN_main responds. Implementation still requires agreed isolation and baseline.
