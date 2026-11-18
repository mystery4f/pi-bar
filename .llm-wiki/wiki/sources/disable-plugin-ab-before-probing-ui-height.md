---
type: source
title: 界面高度问题先用禁用插件做 A/B
status: insight
category: debugging
created: 2026-11-18
updated: 2026-11-18
slug: disable-plugin-ab-before-probing-ui-height
---

# 界面高度问题先用禁用插件做 A/B

排查「界面多出一行/少一行」时，最便宜的一步是让用户禁用插件做 A/B，而不是继续加探针。

本轮为一条底部留白花了四次排查：删尾部占位行、换 powerline 字形、加单行清洗、写 `%TEMP%` trace 探针并读 pi 源码确认 dock 布局。最后用户自己禁用插件复现了同样的留白，一句话定案「与插件无关」。前面那几轮全部是不可得的结论。

结论化的顺序应该是：先在插件层证明「我只画了 3 行」（有测试、有源码），再让宿主/终端这一侧做对照实验。同类框架证据：pi 的 `createChatViewport` dock 顺序里 footer 之后没有任何子节点，`setExtensionFooter` 只做 `footerContainer.clear() + addChild()`——这类静态证据能省掉一轮。

反例教训：中途换字体、改分隔符都是为了迁就一个并不存在的假设，白改一次还 revert 了一次。

相关：[[syntheses/pi-bar-上游实现调研重写基线]]


*Category: debugging*

---
*Captured: 2026-11-18*

## Related

_Add links to related pages._
