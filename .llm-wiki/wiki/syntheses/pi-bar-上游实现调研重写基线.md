---
type: synthesis
title: pi-bar 上游实现调研（重写基线）
tags:
  - pi-bar
  - survey
  - upstream
created: 2026-11-18
updated: 2026-11-18
---

# pi-bar 上游实现调研（重写基线）

调研时间 2026-11-18。上游克隆于 `.tmp/upstream`，读取提交 `1b54352`（2026-06-01，仓库 `mystery4f/pi-bar`）。安装版本基线：pi `@earendil-works/pi-coding-agent` 1.5.2。

## 包里是什么

| 项 | 事实 | 证据 |
|---|---|---|
| 包名 / 版本 | `@npm-ken/pi-bar@1.2.1`（另有一个无关的 `pi-bar@0.3.47`） | `package.json` |
| 入口 | `index.ts` 仅一行 re-export | `index.ts:1` |
| 扩展入口 | `export default function (pi: ExtensionAPI)` | `src/pi-bar.ts:20` |
| 代码量 | 2566 行（`src/config.ts` 789、`src/statusbar.ts` 833、`src/git.ts` 228、`src/pi-bar.ts` 180） | `wc -l` |
| 测试 | 无 | 仓库无 test 目录 |
| 运行时依赖 | 无（peerDeps 只有 pi 两个包） | `package.json` |

## 三个关键实现事实

- **渲染走 footer，但被混淆**：`src/pi-bar.ts:131` 的 `session_start` 里用 `` `set${String.fromCharCode(70,111,111,116,101,114)}` `` 拼出 `setFooter`，再 `statusbarSetter.call(ctx.ui, factory)`。工厂返回 `{ render(width), dispose(), invalidate() }`，`render` 输出 `[truncateToWidth(segments, width), '']`。同一处先 `ctx.ui.setWorkingVisible(false)`，因为 pi 内置的 working 行被自己的 activity 段取代。
- **配置是手写 TOML 解析器**：`src/config.ts` 789 行，自带 `Section` 状态机（`root`/`colors`/`statusbar`/`statusbar_separators`/`statusbar_segment`/`statusbar_segment_state`），`src/config.ts:789` 里 `export const config = loadConfig()` 在模块加载期就抛错/落盘。字符串/数字键白名单分别维护在 `STATUSBAR_SEGMENT_STRING_KEYS` / `STATUSBAR_SEGMENT_NUMBER_KEYS`。
- **表达式求值器**：`src/statusbar.ts:404 evaluateStatusbarExpression()` 用 `new Function` 注入 `segment/ctx/pi/state` 等受限作用域；同一函数被 `value_eval`（`:519`）、`collapsed_eval`（`:542`）、段级 `eval`（`:703`）、activity（`:800`）四处分头调用，字段名不统一。

## 段模型（现状）

`src/config.ts:86 StatusbarSegmentConfig` 的 `type` 联合是 6 种：`value | meter | status | activity | git | dir`（README 只列 5 种）。可配置字段包括 `template`、`collapsed_template`、`eval`、`value_eval`、`show_if`、`empty_text`、`min_width`、`collapse_order`、`states[]`（status/meter/git 各自不同语义）、`spinner`、`sources`、`ignore`。

- 宽度自适应：`src/statusbar.ts` 内 Full → Collapsed → Hidden 三层收缩，由 `collapse_order` 升序触发；这是 pi-bar 相对替代品的唯一差异化行为（不截断、不折行）。
- git 段：`src/git.ts:29 GitSnapshotProvider` 自己维护 fs watcher（HEAD / reftable），而不是用 pi 提供的 `FooterDataProvider.getGitBranch()`。
- 颜色：`src/ansi.ts` 直接输出 24-bit RGB ANSI（`\x1b[38;2;…`），`src/palette.ts` 把配置里的颜色名解析成 RGB。

## pi 1.5.2 提供的接口（新实现要用的）

- `ctx.ui.setFooter(factory)` — `dist/core/extensions/types.d.ts` 中 `ttbei` 行；工厂收到 `(tui, theme, footerData: ReadonlyFooterDataProvider)`。
- `ReadonlyFooterDataProvider` = `getGitBranch() | getExtensionStatuses() | getAvailableProviderCount() | onBranchChange()`，见 `dist/core/footer-data-provider.d.ts`。上下文用量走 `ctx.getContextUsage()`，token 统计走 `ctx.sessionManager.getEntries()`，模型在 `ctx.model`。
- `ctx.ui.setStatus(key, text)` 是其他扩展的唯一注入通道，`getExtensionStatuses()` 把它交给 footer。

## 结论：重写要砍掉的东西

- 手写 TOML 解析器 → `smol-toml`（1.9.1，解包 140 KB）。
- 自建 git watcher → `footerData.getGitBranch()` + 去抖 `git status --porcelain=v2`。
- 四套 eval 字段名 → 一套 `eval` / `when` 表达式。
- `String.fromCharCode` 混淆的 `setFooter` → 直接调用，类型来自 d.ts。
- 三个 `state` 语义各异的 `states[]` → 统一的 `when` 谓词 + 每类型固定 token。

## 本轮产出的洞察（2026-11-18）

- [[sources/pi-footer-api-what-extensions-can-read]] — footer 扩展能拿到的三类数据，以及拿不到的 cache/成本。
- [[sources/collapse-ladder-drop-one-segment-per-step]] — 收缩阶梯每步只丢一段，否则整行消失。
- [[sources/disable-plugin-ab-before-probing-ui-height]] — 界面高度问题先做禁用插件 A/B。
