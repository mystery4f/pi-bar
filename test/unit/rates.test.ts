import { expect, it } from 'vitest';
import { createRateMeter, type RateSample, ratesFrom } from '../../src/rates.ts';

it('divides both halves by the same window', () => {
  // 20K prompt and 400 output tokens, all of it inside one 2.5s request.
  expect(ratesFrom({ inputTokens: 20_000, outputTokens: 400, durationMs: 2500 })).toEqual({
    input: 8000,
    output: 160,
  });
});

it('counts only the prompt tokens the provider had to read fresh', () => {
  // Cache traffic is not new work: the meter never adds cacheRead or cacheWrite to the prompt.
  const meter = createRateMeter();
  meter.begin('assistant', 0);
  meter.end('assistant', { input: 1000, output: 100, cacheRead: 9000, cacheWrite: 0 }, 1000);

  expect(meter.current).toEqual({ input: 1000, output: 100 });
});

it('has nothing to report without tokens or without time', () => {
  expect(ratesFrom({ inputTokens: 0, outputTokens: 0, durationMs: 1000 })).toBeUndefined();
  expect(ratesFrom({ inputTokens: 20_000, outputTokens: 400, durationMs: 0 })).toBeUndefined();
});

it('reports only the half that has tokens', () => {
  expect(ratesFrom({ inputTokens: 1000, outputTokens: 0, durationMs: 1000 })).toEqual({ input: 1000 });
});

it('refuses a total this short, since both tokens landed in one tick', () => {
  expect(ratesFrom({ inputTokens: 70_000, outputTokens: 553, durationMs: 4 })).toBeUndefined();
});

it('measures from the previous message to the end of the answer', () => {
  const meter = createRateMeter();
  meter.begin('user', 0);
  meter.end('user', undefined, 100);
  meter.begin('assistant', 100);
  const rates = meter.end('assistant', { input: 20_000, output: 400 }, 2600);

  expect(rates).toEqual({ input: 8000, output: 160 });
  expect(meter.current).toEqual(rates);
});

it('accumulates the session instead of reporting the last request', () => {
  const meter = createRateMeter();
  meter.begin('assistant', 0);
  meter.end('assistant', { input: 10_000, output: 100 }, 1000);
  meter.begin('assistant', 1000);
  const rates = meter.end('assistant', { input: 10_000, output: 300 }, 3000);

  // 20 000 prompt tokens and 400 output tokens over the 3 000 ms both requests took.
  expect(rates).toEqual({ input: 6667, output: 133 });
});

it('leaves a message with no usage out of the totals', () => {
  const meter = createRateMeter();
  meter.begin('assistant', 0);
  meter.end('assistant', { input: 10_000, output: 100 }, 1000);
  meter.begin('assistant', 1000);
  const kept = meter.end('assistant', undefined, 2000);

  expect(kept).toEqual({ input: 10_000, output: 100 });
});

it('never opens a window for a non-assistant message', () => {
  const meter = createRateMeter();
  meter.begin('toolResult', 0);

  expect(meter.end('toolResult', { input: 10, output: 10 }, 500)).toBeUndefined();
  expect(meter.current).toBeUndefined();
});

it('hands the raw measurement to the debug hook', () => {
  const samples: RateSample[] = [];
  const meter = createRateMeter({ onSample: (sample) => samples.push(sample) });
  meter.begin('assistant', 0);
  meter.end('assistant', { input: 20_000, output: 400 }, 2600);

  expect(samples).toEqual([{ inputTokens: 20_000, outputTokens: 400, durationMs: 2600 }]);
});

it('averages only the requests started inside the window', () => {
  const meter = createRateMeter({ windowMs: 2000 });
  meter.begin('assistant', 0);
  meter.end('assistant', { input: 10_000, output: 100 }, 1000);
  meter.begin('assistant', 1000);
  const rates = meter.end('assistant', { input: 20_000, output: 200 }, 3000);

  // The first request began before the window opened, so only the second one describes now.
  expect(rates).toEqual({ input: 10_000, output: 100 });
});

it('drops a request older than the window instead of slicing its time', () => {
  const meter = createRateMeter({ windowMs: 1000 });
  meter.begin('assistant', 0);

  expect(meter.end('assistant', { input: 10_000, output: 1000 }, 3000)).toBeUndefined();
});
