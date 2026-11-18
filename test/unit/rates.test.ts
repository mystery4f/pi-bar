import { expect, it } from 'vitest';
import { createRateMeter, type RateSample, ratesFrom } from '../../src/rates.ts';

it('splits prefill and generation by their own windows', () => {
  // 20K prompt in a 500ms prefill, 400 output tokens over 2s of streaming.
  expect(ratesFrom({ input: 20_000, output: 400 }, 500, 2000)).toEqual({ input: 40_000, output: 200 });
});

it('counts cached prompt tokens as prompt work', () => {
  const rates = ratesFrom({ input: 1000, output: 100, cacheRead: 9000, cacheWrite: 0 }, 1000, 1000);

  expect(rates?.input).toBe(10_000);
});

it('has nothing to report without usage', () => {
  expect(ratesFrom(undefined, 500, 500)).toBeUndefined();
});

it('has nothing to report when no time passed', () => {
  expect(ratesFrom({ input: 0, output: 0 }, 0, 0)).toBeUndefined();
});

it('reports only the half whose window was measured', () => {
  // No streamed update arrived, so there is no generation window and no honest output rate.
  expect(ratesFrom({ input: 1000, output: 50 }, 1000, 0)).toEqual({ input: 1000 });
});

it('refuses to divide by a window too short to mean anything', () => {
  // A provider that answers in one packet puts both tokens in the same tick.
  expect(ratesFrom({ input: 70_000, output: 553 }, 2400, 4)).toEqual({ input: 29_167 });
  expect(ratesFrom({ input: 70_000, output: 553 }, 12, 4)).toBeUndefined();
});

it('measures from message start to the first token, then to the end', () => {
  const meter = createRateMeter();
  meter.begin('user', 0);
  meter.begin('assistant', 100);
  meter.firstToken('assistant', 600);
  const rates = meter.end('assistant', { input: 20_000, output: 400 }, 2600);

  expect(rates).toEqual({ input: 40_000, output: 200 });
  expect(meter.current).toEqual(rates);
});

it('ignores a second token event, so the first one keeps the prefill window', () => {
  const meter = createRateMeter();
  meter.begin('assistant', 0);
  meter.firstToken('assistant', 500);
  meter.firstToken('assistant', 1500);

  expect(meter.end('assistant', { input: 10_000, output: 100 }, 2500)).toEqual({ input: 20_000, output: 50 });
});

it('keeps the previous rate when the next message reports no usage', () => {
  const meter = createRateMeter();
  meter.begin('assistant', 0);
  meter.firstToken('assistant', 1000);
  meter.end('assistant', { input: 10_000, output: 100 }, 2000);

  meter.begin('assistant', 3000);
  const kept = meter.end('assistant', undefined, 4000);

  expect(kept).toEqual({ input: 10_000, output: 100 });
});

it('never times a non-assistant message', () => {
  const meter = createRateMeter();
  meter.begin('toolResult', 0);
  meter.firstToken('toolResult', 100);

  expect(meter.end('toolResult', { input: 10, output: 10 }, 500)).toBeUndefined();
});

it('hands the raw measurement to the debug hook, windows included', () => {
  const samples: RateSample[] = [];
  const meter = createRateMeter((sample) => samples.push(sample));
  meter.begin('assistant', 100);
  meter.firstToken('assistant', 600);
  meter.end('assistant', { input: 20_000, output: 400 }, 2600);

  expect(samples).toEqual([{ prompt: 20_000, output: 400, prefillMs: 500, streamMs: 2000 }]);
});
