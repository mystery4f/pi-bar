/**
 * Token throughput, split into the two phases a request actually has.
 *
 * Prefill is a burst: the whole prompt is read before the first token appears, so its rate is
 * prompt tokens over the wait for that first token. Generation is a stream, so its rate is output
 * tokens over the time between the first and the last token. Averaging both over the whole request
 * would report one meaningless number, which is why the bar shows them side by side.
 */
export interface TokenUsage {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

/** Either half may be missing: a phase whose window could not be measured is not reported. */
export interface RateSnapshot {
  input?: number;
  output?: number;
}

/** One request as it was measured, for `PI_BAR_DEBUG_RATES` — the numbers behind the bar. */
export interface RateSample {
  prompt: number;
  output: number;
  prefillMs: number;
  streamMs: number;
}

/**
 * A window this short cannot carry a throughput number. When a provider answers in one packet the
 * first and the last token land in the same tick, and dividing by that tick would invent a rate —
 * the source of the implausible `out` figures a buffered stream produces.
 */
const MIN_WINDOW_MS = 50;

const promptOf = (usage: TokenUsage): number => usage.input + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0);

const perSecond = (tokens: number, milliseconds: number): number | undefined => {
  if (tokens <= 0 || milliseconds < MIN_WINDOW_MS) return undefined;

  return Math.round(tokens / (milliseconds / 1000));
};

/**
 * Rates from one finished assistant message. Each half stands on its own window: a phase that was
 * never timed is left out instead of borrowing the other window's time.
 */
export const ratesFrom = (
  usage: TokenUsage | undefined,
  prefillMs: number,
  streamMs: number,
): RateSnapshot | undefined => {
  if (usage === undefined) return undefined;

  const input = perSecond(promptOf(usage), prefillMs);
  const output = perSecond(usage.output, streamMs);
  if (input === undefined && output === undefined) return undefined;

  return { ...(input === undefined ? {} : { input }), ...(output === undefined ? {} : { output }) };
};

export interface RateMeter {
  /** The agent started a message; only assistant messages are timed. */
  begin(role: string, now: number): void;
  /** The first streamed token arrived, ending prefill and starting the generation window. */
  firstToken(role: string, now: number): void;
  /** The message finished; the returned snapshot replaces the previous one. */
  end(role: string, usage: TokenUsage | undefined, now: number): RateSnapshot | undefined;
  readonly current: RateSnapshot | undefined;
}

export const createRateMeter = (onSample?: (sample: RateSample) => void): RateMeter => {
  let startedAt: number | null = null;
  let firstTokenAt: number | null = null;
  let last: RateSnapshot | undefined;

  return {
    begin(role, now) {
      if (role !== 'assistant') return;

      startedAt = now;
      firstTokenAt = null;
    },
    firstToken(role, now) {
      if (role !== 'assistant' || startedAt === null || firstTokenAt !== null) return;

      firstTokenAt = now;
    },
    end(role, usage, now) {
      if (role !== 'assistant' || startedAt === null) return last;

      const start = startedAt;
      const first = firstTokenAt;
      startedAt = null;
      firstTokenAt = null;

      // No first token means the request never streamed: the whole wait was prefill, and there is
      // no generation window to divide by.
      const prefillMs = (first ?? now) - start;
      const streamMs = first === null ? 0 : now - first;
      if (onSample !== undefined && usage !== undefined) {
        onSample({ prompt: promptOf(usage), output: usage.output, prefillMs, streamMs });
      }

      last = ratesFrom(usage, prefillMs, streamMs) ?? last;

      return last;
    },
    get current() {
      return last;
    },
  };
};
