/**
 * A fake pi and a fake context, wired the same way the real host wires them.
 *
 * The harness deliberately knows nothing about the bar: it only records what the entry
 * point registers, then replays events and asks the footer to render. That way the tests
 * exercise the public seam — install, event, render — and not the internals.
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';

import { stripAnsi } from '../../src/palette.ts';

export { stripAnsi };

/** One row as the user sees it, with the styling removed. */
export interface PlainRows {
  rows: string[];
  widthOf(row: number): number;
}

export interface Harness {
  readonly pi: ExtensionAPI;
  /** Counts footer redraw requests, so "the bar asked for a repaint" is observable. */
  repaints(): number;
  emit(event: string, payload?: Record<string, unknown>): void;
  render(width: number): string[];
  plain(width: number): PlainRows;
  setBranch(branch: string | null): void;
  setStatus(key: string, text: string): void;
  /** Warning texts the entry point sent to the user, e.g. a broken config file. */
  notifies(): string[];
  clearStatus(key: string): void;
}

interface HarnessOptions {
  cwd?: string;
  modelId?: string;
  thinkingLevel?: string;
  percent?: number | null;
  /** Token count of the live context; omit to derive it from `percent`, `null` for unknown. */
  tokens?: number | null;
  contextWindow?: number;
  providers?: number;
  hasUI?: boolean;
  /** Config file the entry point should load; omit for a path that does not exist. */
  configPath?: string;
}

type RegisteredHandler = (event: unknown, ctx: ExtensionContext) => void;

export function createHarness(options: HarnessOptions = {}): Harness {
  const cwd = options.cwd ?? '/work/pi-bar';
  const modelId = options.modelId ?? 'group/deepseek-flash';
  const thinkingLevel = options.thinkingLevel ?? 'medium';
  const percent = options.percent === undefined ? 59 : options.percent;
  const tokens = options.tokens === undefined ? (percent === null ? null : Math.round(percent * 1.5)) : options.tokens;
  const contextWindow = options.contextWindow ?? 150;
  const providers = options.providers ?? 1;
  // Never let a test pick up the developer's own ~/.pi/agent/pi-bar.toml.
  const configPath = options.configPath ?? join(tmpdir(), 'pi-bar-test-no-config.toml');

  const handlers = new Map<string, RegisteredHandler[]>();
  const statuses = new Map<string, string>();
  const notifies: string[] = [];
  let branch: string | null = 'main';
  let repaints = 0;
  let footer: { render(width: number): string[] } | null = null;

  const tui = {
    requestRender() {
      repaints += 1;
    },
  };

  const footerData = {
    getGitBranch: () => branch,
    getExtensionStatuses: () => statuses as ReadonlyMap<string, string>,
    getAvailableProviderCount: () => providers,
    onBranchChange: () => () => {},
  };

  const ctx = {
    cwd,
    hasUI: options.hasUI ?? true,
    model: { id: modelId },
    thinkingLevel,
    getContextUsage: () => ({
      tokens,
      contextWindow,
      percent,
    }),
    ui: {
      setWorkingVisible() {},
      notify: (message: string) => notifies.push(message),
      setFooter(factory: (tuiInstance: unknown, theme: unknown, data: unknown) => typeof footer) {
        footer = factory(tui, {}, footerData);
      },
    },
  } as unknown as ExtensionContext;

  const pi = {
    on(event: string, handler: RegisteredHandler) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
  } as unknown as ExtensionAPI;

  process.env.PI_BAR_CONFIG = configPath;

  const harness: Harness = {
    pi,
    notifies: () => notifies,
    repaints: () => repaints,
    emit(event, payload = {}) {
      const list = handlers.get(event) ?? [];
      for (const handler of list) handler(payload, ctx);
    },
    render(width) {
      if (footer === null) throw new Error('render() before the footer was installed — emit session_start first');
      return footer.render(width);
    },
    plain(width) {
      const rows = harness.render(width).map(stripAnsi);
      return { rows, widthOf: (row) => rows[row]?.length ?? 0 };
    },
    setBranch(next) {
      branch = next;
    },
    setStatus(key, text) {
      statuses.set(key, text);
    },
    clearStatus(key) {
      statuses.delete(key);
    },
  };

  return harness;
}
