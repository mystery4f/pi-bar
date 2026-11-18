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

export interface RateSnapshot {
  input: number;
  output: number;
}

const perSecond = (tokens: number, milliseconds: number): number | undefined => {
  if (tokens <= 0 || milliseconds <= 0) return undefined;

  return Math.round(tokens / (milliseconds / 1000));
};

/**
 * Rates from one finished assistant message. A phase with no measurable time falls back to the
 * other one, so a provider that reports usage without any streaming still yields a number.
 */
export const ratesFrom = (
  usage: TokenUsage | undefined,
  prefillMs: number,
  streamMs: number,
): RateSnapshot | undefined => {
  if (usage === undefined) return undefined;

  const prompt = usage.input + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0);
  const input = perSecond(prompt, prefillMs) ?? perSecond(prompt, streamMs);
  const output = perSecond(usage.output, streamMs) ?? perSecond(usage.output, prefillMs);
  if (input === undefined && output === undefined) return undefined;

  return { input: input ?? 0, output: output ?? 0 };
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

export const createRateMeter = (): RateMeter => {
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
      const first = firstTokenAt ?? now;
      startedAt = null;
      firstTokenAt = null;

      last = ratesFrom(usage, first - start, now - first) ?? last;

      return last;
    },
    get current() {
      return last;
    },
  };
};
