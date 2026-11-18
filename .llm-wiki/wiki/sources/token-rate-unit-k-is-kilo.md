---
type: source
title: 词元速率里的 k 是千，不是 token
status: insight
category: convention
created: 2026-11-18
updated: 2026-11-18
slug: token-rate-unit-k-is-kilo
---

# 词元速率里的 k 是千，不是 token

LLM 速率的标准单位是 `tokens/s`（也写 `tok/s`、`t/s`、`TPS`）。其中的 `k` 是 kilo=10³ 的数量级前缀，不是 token 的缩写：`1.2k t/s` 读作每秒 1200 词元。

- pistatusline 的 `formatSpeed` 就只做两档：`>= 1000` 输出 `${n}k t/s`，否则 `${n} t/s`；没有 M 档，词元速率到不了百万级。
- 裸写 `240 k/s` 会让人误以为 k 是单位，所以单位必须写全，k 只挂在数字上做缩写。
- 与之区分：词元规模（`ctx 125K/1M`）用大写 K/M 当数量缩写，是另一套写法。
- 行业另有两个名词：TTFT（首词元等待时长）与吞吐；prefill 吞吐通常以「等首词元的时间」为分母，decode/generation 吞吐以「生成总时长为分母」。工程上看板更适合统一分母的会话平均，因为跨模型可比。

*Category: convention*

---
*Captured: 2026-11-18*

## Related

_Add links to related pages._
