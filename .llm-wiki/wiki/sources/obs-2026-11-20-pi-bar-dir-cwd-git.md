---
type: source
title: "Observation: pi-bar dir 取会话 cwd，非 git 目录无分支段属正常"
tags:
  - pi-bar
  - pi-session
  - git-branch
  - debugging
status: observation
created: 2026-11-20
updated: 2026-11-20
slug: obs-2026-11-20-pi-bar-dir-cwd-git
relevance: medium
observed_at: 2026-11-20T12:32:55.578Z
source_context: pi-bar 目录/分支段排查
---

# 🔍 Observation: pi-bar dir 取会话 cwd，非 git 目录无分支段属正常

排查 pi-bar「跨目录 resume 时 dir/分支不对」结论：不是 bug。pi 1.5.2 下 ctx.cwd 与 sessionManager.getCwd() 都等于会话文件 header 里的 cwd，与启动目录无关（dist/main.js:611 只有会话 cwd 不存在时才用 cwdOverride）；分支段取自 footerData.getGitBranch()，对 C:\Users\10781\.pi、D:\work\tmp 这类非 git 目录返回 null，段因空文本被 show() 过滤，行为正确。实测 D:\work\Code\Other\Nib 会话从 D:\work\tmp 启动，栏第二行渲染为 `  Nib │ 基于 keel 的 mini markdown 编辑器 │  main`。Git Bash 里 `set X=...` 不生效，必须 `export`，且路径要写 Windows 形式（Node 不会转换 /c/...）。诊断探针（src/debug.ts，env PI_BAR_DEBUG_LOG）用完已删除，tsc/biome/vitest(67/67) 全绿。

*Relevance: medium*
*Context: pi-bar 目录/分支段排查*
*Tags: pi-bar pi-session git-branch debugging*

---
*Observed: 2026-11-20T12:32:55.578Z*
