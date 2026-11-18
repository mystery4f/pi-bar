---
type: source
title: 收缩阶梯：每步只放弃一段而非整档
status: insight
category: bugfix
created: 2026-11-18
updated: 2026-11-18
slug: collapse-ladder-drop-one-segment-per-step
---

# 收缩阶梯：每步只放弃一段而非整档

收缩（collapse）阶梯最常见的 bug 是「同档位一次性清空」：按 `collapse` 值分组，一次把同一档位的所有段全清掉，于是整行瞬间变空——用户看到的就是「第三行不见了」。

正确做法是**每步只放弃一段**，同档位从右往左，边丢边测宽度，够窄立即返回。pi-bar 的实现里 targets 用索引反转实现：`map((segment, index) => ...).filter(...).map(({index}) => index).reverse()`。

为什么容易踩：把 collapse 当成「优先级分层」，就会顺手写 `for level of levels: 清空所有该 level 的段`。而这个 bug 只在「同一行里有多个同档位段 + 终端变窄」时出现，普通单测（少段、宽终端）完全不覆盖。回归用例要固定成「8 个同档位状态 + 209 列」这种真实组合。

相关：[[syntheses/pi-bar-上游实现调研重写基线]]


*Category: bugfix*

---
*Captured: 2026-11-18*

## Related

_Add links to related pages._
