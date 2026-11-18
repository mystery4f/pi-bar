---
type: source
title: pistatusline 的速率实现口径
status: insight
category: reference
created: 2026-11-18
updated: 2026-11-18
slug: pistatusline-speed-metrics
---

# pistatusline 的速率实现口径

参考实现 `@christophesamueldhp/pistatusline@0.1.5`，速率相关代码在 `dist/chunks/chunk-Z3YWK2TV.js` 的 `src/utils/speed-metrics.ts` 与 speed widget 段。

- 请求区间在 `collectSpeedMetricRecord` 里生成：`{ startMs: lastUserTimestampMs, endMs: assistantTimestampMs }`，即「用户消息时间戳 → assistant 消息时间戳」，一个请求一个区间。
- `buildSpeedMetrics` 把所有区间交给 `mergeIntervals` 合并重叠，`getIntervalsDurationMs` 求和得到 `totalDurationMs`。
- 三个计算器 `calculateInputSpeed` / `calculateOutputSpeed` / `calculateTotalSpeed` **用同一个 `totalDurationMs` 当分母**，`totalDurationMs === 0` 时返回 null（显示 `—`）。
- `inputTokens` 只取 `usage.input_tokens`，缓存读写只用于上下文占比（`contextLengthFromUsageTokens`）。
- 默认 `DEFAULT_SPEED_WINDOW_SECONDS = 0`（整场平均），窗口取值被 `clampSpeedWindowSeconds` 限制在 0-120 秒，窗口版指标来自 `context.windowedSpeedMetrics[seconds]`。

因此它报的是「会话级吞吐」，不是某一阶段的瞬时速度，这也是数字比 pi-bar 旧实现小两三个数量级的原因。

*Category: reference*

---
*Captured: 2026-11-18*

## Related

_Add links to related pages._
