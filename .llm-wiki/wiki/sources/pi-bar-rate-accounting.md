---
type: source
title: pi-bar 速率改为同一分母的会话平均
status: insight
category: architecture
created: 2026-11-18
updated: 2026-11-18
slug: pi-bar-rate-accounting
---

# pi-bar 速率改为同一分母的会话平均

pi-bar 的 in/out 速率从「预填充窗口 / 生成窗口分开算」改成 pistatusline 的口径：两侧共用一个分母。

- 分母 = 从上一条消息结束到本次 assistant 回答结束的墙钟（含网络等待与生成），按会话累计。
- in 只算 `usage.input`；cacheRead / cacheWrite 不计入，因为它们不是新读入的内容。
- 无 usage 的消息（中断、失败请求）完全不进汇总，避免拖低均值。
- 汇总时长 < 50ms 时报不出速率——两个词元落在同一个 tick 里，除出来的是发明出来的数。
- `[rate] window` = 0 表示整场平均；1-120 秒只看该窗口内**开始**的请求，请求要么整条计入要么不计，因为词元数不可切片。

改动前同一个请求报 `in 240 k/s out 310/s`（分母是 1.5 秒局部窗口），改动后报 `in 4.6k t/s out 119 t/s`（分母是 5.2 秒完整请求）。相关：[[sources/pi-footer-api-what-extensions-can-read]]

*Category: architecture*

---
*Captured: 2026-11-18*

## Related

_Add links to related pages._
