---
type: source
title: pi 1.5.2 footer 扩展可见的数据边界
status: insight
category: architecture
created: 2026-11-18
updated: 2026-11-18
slug: pi-footer-api-what-extensions-can-read
---

# pi 1.5.2 footer 扩展可见的数据边界

pi 1.5.2 里替换 footer 的扩展能拿到的数据只有三类，超出部分拿不到，规划段类型时先按这个边界削减预期。

`ctx.ui.setFooter(factory)` 的 factory 收到 `(tui, theme, footerData)`，其中 `ReadonlyFooterDataProvider` 只有 `getGitBranch()`、`getExtensionStatuses()`、`getAvailableProviderCount()`、`onBranchChange()`。`ExtensionContext` 额外给 `cwd`、`model`、`thinkingLevel`、`getContextUsage()`（`{tokens, contextWindow, percent}`，压缩后可能全为 null）。

拿不到的：内置 footer 的 cache 读写命中率、成本、session 统计——`ReadonlySessionManager` 是 `Pick<SessionManager, ...>`，故意不含这些字段。实测 `getAvailableProviderCount()` 在真实会话里返回过 `0`，所以「provider 数量」段必须设置 `> 1` 才显示的守卫。

证据在 pi-bar 的 `docs/adr/0005-status-only-extension-point.md` 与 `HANDOVER.md`。相关：[[syntheses/pi-bar-上游实现调研重写基线]]


*Category: architecture*

---
*Captured: 2026-11-18*

## Related

_Add links to related pages._
