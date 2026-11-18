/**
 * Token throughput over the session, measured against the wall clock the requests actually took.
 *
 * A request is not one speed: the prompt is read before the first token, then the answer streams.
 * Timing those phases separately multiplies figures nobody can compare — a provider that answers in
 * one packet reports a huge prefill and an invented generation rate. So both halves share one
 * window, the wait from the end of the previous message to the end of this answer, and the totals
 * accumulate across the session. Tokens over elapsed time is the number that stays comparable as
 * models, providers and request sizes change.
 */
export interface TokenUsage {
  input: number;
  output: number;
  /** Cached prompt tokens: tracked by the caller, never counted as new prompt work here. */
  cacheRead?: number;
  cacheWrite?: number;
}

/** Either half stays missing while the session has not produced that kind of token. */
export interface RateSnapshot {
  input?: number;
  output?: number;
}

/** What one closed request contributed, for `PI_BAR_DEBUG_RATES` — the numbers behind the bar. */
export interface RateSample {
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

/** What the rates are divided by, accumulated across the session. */
export interface RateTotals {
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

/** A total this short is a tick rather than a measurement; dividing by it invents a speed. */
const MIN_WINDOW_MS = 50;

const perSecond = (tokens: number, milliseconds: number): number | undefined => {
  if (tokens <= 0) return undefined;

  return Math.round(tokens / (milliseconds / 1000));
};

/** Session-average throughput: the same denominator for both halves, by design. */
export const ratesFrom = (totals: RateTotals): RateSnapshot | undefined => {
  if (totals.durationMs < MIN_WINDOW_MS) return undefined;

  const input = perSecond(totals.inputTokens, totals.durationMs);
  const output = perSecond(totals.outputTokens, totals.durationMs);
  if (input === undefined && output === undefined) return undefined;

  return { ...(input === undefined ? {} : { input }), ...(output === undefined ? {} : { output }) };
};

export interface RateMeter {
  /** A message started; an assistant reply opens a window at the end of the previous message. */
  begin(role: string, now: number): void;
  /** A message finished: another role only moves the anchor, an assistant reply closes the window. */
  end(role: string, usage: TokenUsage | undefined, now: number): RateSnapshot | undefined;
  readonly current: RateSnapshot | undefined;
}

export const createRateMeter = (onSample?: (sample: RateSample) => void): RateMeter => {
  // Where the next assistant window can start: the moment the previous message finished.
  let anchor: number | null = null;
  let openedAt: number | null = null;
  const totals: RateTotals = { inputTokens: 0, outputTokens: 0, durationMs: 0 };
  let last: RateSnapshot | undefined;

  return {
    begin(role, now) {
      if (role !== 'assistant') return;

      openedAt = anchor ?? now;
    },
    end(role, usage, now) {
      const startedAt = openedAt;
      openedAt = null;
      anchor = now;

      // A message without usage (an abort, a failed request) contributed no tokens, so its time
      // stays out of the totals instead of dragging the average down.
      if (role !== 'assistant' || startedAt === null || usage === undefined) return last;

      const durationMs = now - startedAt;
      totals.inputTokens += usage.input;
      totals.outputTokens += usage.output;
      totals.durationMs += durationMs;
      onSample?.({ inputTokens: usage.input, outputTokens: usage.output, durationMs });

      last = ratesFrom(totals) ?? last;

      return last;
    },
    get current() {
      return last;
    },
  };
};
