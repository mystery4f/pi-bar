---
type: source
title: 用删库重建替换远端仓库历史
status: insight
category: devops
created: 2026-11-18
updated: 2026-11-18
slug: replace-remote-repo-by-delete-and-create
---

# 用删库重建替换远端仓库历史

把本地全新历史推到一个已有同名远端仓库时，最省事且可复现的做法是**删库重建**，而不是 force-push 覆盖（会留下旧分支、旧 tag 和旧 release）：

```bash
git branch -m main                     # 本地先对齐远端默认分支名
gh repo delete <owner>/<repo> --yes    # 需要 delete_repo scope
gh repo create <owner>/<repo> --public --source=. --remote=origin --description "…" --push
```

`gh repo create --source=. --remote=origin --push` 一步搞定 remote、分支跟踪和首次推送，之后 `git --no-pager status -sb` 应显示 `## main...origin/main`（无 ahead）。

注意两点：删除 public 仓库不可撤销，执行前必须拿到用户明确授权；删库后 GitHub 的 push 记录也会消失，旧代码只能靠本地 clone 找回。

相关：[[sources/disable-plugin-ab-before-probing-ui-height]]


*Category: devops*

---
*Captured: 2026-11-18*

## Related

_Add links to related pages._
