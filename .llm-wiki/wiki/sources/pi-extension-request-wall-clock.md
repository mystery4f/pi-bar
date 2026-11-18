---
type: source
title: pi 扩展如何给一次请求计时
status: insight
category: debug-case
created: 2026-11-18
updated: 2026-11-18
slug: pi-extension-request-wall-clock
---

# pi 扩展如何给一次请求计时

pi 的扩展事件里没有用户消息的发送时间戳，只有 `message_start` / `message_update` / `message_end`（各自带 message）与 `turn_start` / `turn_end`。所以「一次请求花了多久」必须自己立锚点。

做法：任何一条消息的 `message_end` 都记录为锚点，assistant 的 `message_start` 用「上一个锚点」作为窗口起点，`message_end` 关闭窗口。这样工具调用循环也自然成立：工具结果消息的 end 就是下一次回答的起点。

坑：`message_start` 是在 HTTP 响应头之后才触发的，所以拿它当起点会漏掉排队与首包等待，in 速率会偏高；用「上一条消息结束」当起点才接近用户感知的墙钟。另：无 usage 的消息（中断）不能计入时长，否则均值被拉低。相关：[[sources/pi-footer-api-what-extensions-can-read]]

*Category: debug-case*

---
*Captured: 2026-11-18*

## Related

_Add links to related pages._
