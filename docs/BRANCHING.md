# Branching Strategy

ResearchKit OS follows a simplified Git Flow optimized for solo / small-team hackathon development.

---

## Branch Model

| Branch | Purpose | Lifetime | Rules |
|---|---|---|---|
| `main` | Always-demoable, always-competition-ready stable release | Permanent | Only merge from `develop` or hotfix branches. Every commit on `main` should be deployable to Vercel and pass smoke tests. |
| `develop` | Daily development and refactoring | Permanent | All feature branches merge here first. Integration tests run before promoting to `main`. |
| `feature/ui-v2` | UI redesign experiments | Ephemeral | Delete after merge. |
| `feature/agent-v2` | Agent architecture upgrades (Critic / Explainer / new roles) | Ephemeral | Delete after merge. |
| `feature/memory` | Long-term memory system | Ephemeral | Delete after merge. |
| `feature/workflow` | Workflow agent for multi-step research tasks | Ephemeral | Delete after merge. |

---

## Workflow

### 1. Start a feature

```bash
git checkout develop
git pull origin develop
git checkout -b feature/<name>
```

### 2. Commit work (small, focused commits)

```bash
git add <files>
git commit -m "feat: add Critic agent scaffold"
```

Follow [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation only
- `refactor:` code restructuring (no behavior change)
- `chore:` build / config / tooling
- `test:` adding or fixing tests

### 3. Merge to develop

```bash
git checkout develop
git pull origin develop
git merge --no-ff feature/<name>
git push origin develop
git branch -d feature/<name>  # delete local
git push origin --delete feature/<name>  # delete remote
```

### 4. Promote to main (only when stable + smoke-tested)

```bash
git checkout main
git pull origin main
git merge --no-ff develop -m "release: v1.1"
git push origin main

# Tag the release
git tag v1.1 -m "v1.1 — Reflection + Planner"
git push origin v1.1
```

### 5. Create GitHub Release

Use `gh` CLI or the GitHub web UI to convert the tag into a Release with notes copied from `docs/CHANGELOG.md`.

---

## Hotfix Workflow

For critical bugs found in `main`:

```bash
git checkout main
git checkout -b hotfix/<name>
# fix the bug
git commit -m "fix: planner empty JSON causes all agents to fail"
git checkout main
git merge --no-ff hotfix/<name>
git checkout develop
git merge --no-ff hotfix/<name>  # keep develop in sync
git branch -d hotfix/<name>
git tag v1.0.1 -m "v1.0.1 — hotfix"
git push origin main develop v1.0.1
```

---

## Tag Policy

| Tag format | When |
|---|---|
| `v1.0`, `v1.1`, `v2.0` | Major / minor releases (matched to CHANGELOG.md entries) |
| `v1.0.1`, `v1.0.2` | Patch / hotfix releases |

Every tag becomes a GitHub Release with full release notes from `CHANGELOG.md`.

---

## Protection Rules (recommended when team grows)

- `main`: require pull request review, require status checks (CI green), require linear history
- `develop`: require pull request review, require status checks (CI green)

For solo development, these are optional — but still use pull requests for self-review before promoting to `main`.
