/**
 * Token throughput over the session, measured against the wall clock the requests actually took.
 *
 * A request is not one speed: the prompt is read before the first token, then the answer streams.
 * Timing those phases separately multiplies figures nobody can compare — a provider that answers in
 * one packet reports a huge prefill and an invented generation rate. So both halves share one
 * window, the wait from the end of the previous message to the end of this answer. Tokens over
 * elapsed time is the number that stays comparable as models, providers and request sizes change.
 *
 * The window that gets averaged is the whole session by default; `windowMs` narrows it to the
 * recent requests, which follows a burst instead of the session at the cost of a moving reading.
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

/** What the rates are divided by over the averaged window. */
export interface RateTotals {
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

export interface RateMeterOptions {
  /** Look back this many milliseconds; 0 (the default) averages the whole session. */
  windowMs?: number;
  onSample?: (sample: RateSample) => void;
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

/** One finished request, kept so a rolling window can average only the recent ones. */
interface RequestRecord {
  startedAt: number;
  endedAt: number;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Sum the records that overlap the window. A request straddling the edge is counted for the part
 * inside it — tokens and time together — so neither is divided by a window it was not part of.
 */
const totalsWithin = (records: readonly RequestRecord[], windowMs: number, now: number): RateTotals => {
  const windowStart = windowMs > 0 ? now - windowMs : Number.NEGATIVE_INFINITY;
  const totals: RateTotals = { inputTokens: 0, outputTokens: 0, durationMs: 0 };

  for (const record of records) {
    // A request counts whole or not at all: its token count is a single number, so slicing the
    // time it took would divide real tokens by a window they were never produced in.
    if (record.startedAt < windowStart) continue;

    const durationMs = record.endedAt - record.startedAt;
    if (durationMs <= 0) continue;

    totals.inputTokens += record.inputTokens;
    totals.outputTokens += record.outputTokens;
    totals.durationMs += durationMs;
  }

  return totals;
};

export interface RateMeter {
  /** A message started; an assistant reply opens a window at the end of the previous message. */
  begin(role: string, now: number): void;
  /** A message finished: another role only moves the anchor, an assistant reply closes the window. */
  end(role: string, usage: TokenUsage | undefined, now: number): RateSnapshot | undefined;
  readonly current: RateSnapshot | undefined;
}

export const createRateMeter = (options: RateMeterOptions = {}): RateMeter => {
  const windowMs = options.windowMs ?? 0;
  const records: RequestRecord[] = [];
  // Where the next assistant window can start: the moment the previous message finished.
  let anchor: number | null = null;
  let openedAt: number | null = null;
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

      records.push({
        startedAt,
        endedAt: now,
        inputTokens: usage.input,
        outputTokens: usage.output,
      });
      options.onSample?.({ inputTokens: usage.input, outputTokens: usage.output, durationMs: now - startedAt });
      last = ratesFrom(totalsWithin(records, windowMs, now)) ?? last;

      return last;
    },
    get current() {
      return last;
    },
  };
};
