/**
 * The bar itself: three rows, each rendered from the same snapshot.
 *
 * Row roles follow how fast the data changes, so the eye lands on the row that is moving:
 * `working` (seconds), `place` (minutes-to-hours), `reported` (whatever extensions push).
 * A row with nothing to say is dropped, so an idle session costs two rows, not three.
 */
import type { ExtensionContext, ReadonlyFooterDataProvider } from '@earendil-works/pi-coding-agent';
import type { TUI } from '@earendil-works/pi-tui';
import type { BarConfig } from './config.ts';
import { layout, renderLine, type Segment } from './layout.ts';
import { PALETTE, stripAnsi } from './palette.ts';
import { createRateMeter, type TokenUsage } from './rates.ts';

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/** Token counts read at a glance: 1860 -> `1860`, 186000 -> `186K`, 1860000 -> `1.9M`. */
const compact = (count: number): string => {
  if (count < 1000) return String(count);

  const thousands = count / 1000;
  if (thousands < 1000) return `${Math.round(thousands)}K`;

  return `${(thousands / 1000).toFixed(1).replace(/\.0$/, '')}M`;
};

export interface Bar {
  /** Rows for the current width; the caller owns adding the trailing spacer row. */
  render(ctx: ExtensionContext, footerData: ReadonlyFooterDataProvider, width: number): string[];
  turnStart(): void;
  turnEnd(): void;
  messageStart(role: string): void;
  messageToken(role: string): void;
  messageEnd(role: string, usage: TokenUsage | undefined): void;
  toolStart(toolCallId: string, toolName: string): void;
  toolEnd(toolCallId: string): void;
  /** Ask pi to redraw, for changes it does not announce itself. */
  refresh(): void;
  readonly layout: typeof layout;
  dispose(): void;
}

export function createBar(tui: TUI, config: BarConfig): Bar {
  layout.styles = config.style === 'mixed' ? ['block', 'flat', 'flat'] : [config.style, config.style, config.style];

  let spinnerFrame = 0;
  let spinnerTimer: ReturnType<typeof setInterval> | null = null;
  let streaming = false;
  const activeTools = new Map<string, string>();
  const rates = createRateMeter();

  const requestRender = (): void => {
    tui.requestRender();
  };

  const startSpinner = (): void => {
    if (spinnerTimer !== null) return;
    spinnerTimer = setInterval(() => {
      spinnerFrame = (spinnerFrame + 1) % SPINNER.length;
      requestRender();
    }, 100);
  };

  const stopSpinner = (): void => {
    if (spinnerTimer === null) return;
    clearInterval(spinnerTimer);
    spinnerTimer = null;
  };

  const frame = (): string => SPINNER[spinnerFrame] ?? '';

  const activityText = (): string => {
    const tools = [...new Set(activeTools.values())];
    if (tools.length > 0) return `${frame()} ${tools.join(',')}`;
    if (streaming) return `${frame()} working`;
    return '';
  };

  /** A segment that a config switch can remove; disabled segments never reach the row. */
  const keep = (enabled: boolean, segment: Segment): Segment[] => (enabled ? [segment] : []);

  /** Rates read as `310/s`, `240 k/s`, `1.2 M/s` — lower-case unit, spaced off the number. */
  const rateText = (perSecond: number): string => {
    if (perSecond < 1000) return `${compact(perSecond)}/s`;

    const thousands = perSecond / 1000;
    if (thousands < 1000) return `${Math.round(thousands)} k/s`;

    return `${(thousands / 1000).toFixed(1).replace(/\.0$/, '')} M/s`;
  };

  /** One phase of the last request, in tokens per second. */
  const rateSegment = (prefix: string, perSecond: number): Segment => ({
    prefix,
    text: rateText(perSecond),
    prefixFg: PALETTE.dim,
    fg: PALETTE.text,
    flatFg: PALETTE.inkYellow,
    bg: PALETTE.dir,
    collapse: 4,
  });

  const buildLines = (ctx: ExtensionContext, footerData: ReadonlyFooterDataProvider): Segment[][] => {
    const branch = footerData.getGitBranch();
    const model = ctx.model?.id ?? 'no model';
    const thinking = ctx.thinkingLevel ?? '';
    const usage = ctx.getContextUsage();
    const percent = usage?.percent ?? null;
    const dirName = ctx.cwd.split(/[\\/]/).filter(Boolean).pop() ?? ctx.cwd;

    const contextBg =
      percent === null ? PALETTE.dir : percent > 85 ? PALETTE.alert : percent > 60 ? PALETTE.warn : PALETTE.ok;
    const contextInk =
      percent === null
        ? PALETTE.dim
        : percent > 85
          ? PALETTE.inkRed
          : percent > 60
            ? PALETTE.inkYellow
            : PALETTE.inkGreen;

    const rate = config.segments.rates ? rates.current : undefined;
    // Line 1 — what the agent is doing right now.
    const working: Segment[] = [
      ...keep(config.segments.activity, {
        text: activityText(),
        fg: PALETTE.activityFg,
        flatFg: PALETTE.inkTeal,
        bg: PALETTE.activity,
        collapse: 5,
        collapsed: frame(),
      }),
      ...keep(config.segments.model, {
        text: model,
        fg: PALETTE.text,
        flatFg: PALETTE.inkBlue,
        bg: PALETTE.model,
        collapse: 3,
        collapsed: model.split('/').pop() ?? model,
      }),
      ...keep(config.segments.thinking, {
        text: thinking === '' ? 'think:off' : thinking,
        fg: PALETTE.text,
        flatFg: PALETTE.inkTeal,
        bg: PALETTE.thinking,
        collapse: 2,
      }),
      ...keep(config.segments.context, {
        text: percent === null ? '--' : `${Math.round(percent)}%`,
        fg: PALETTE.text,
        flatFg: contextInk,
        bg: contextBg,
        collapse: 4,
      }),
      ...(rate === undefined ? [] : [rateSegment('in', rate.input), rateSegment('out', rate.output)]),
    ];

    // Line 2 — where the work is happening.
    const place: Segment[] = [
      ...keep(config.segments.cwd, {
        text: `\u{F07B} ${dirName}`,
        fg: PALETTE.text,
        flatFg: PALETTE.inkText,
        bg: PALETTE.dir,
        collapse: 1,
      }),
      ...keep(config.segments.branch, {
        text: branch ? `\u{E0A0} ${branch}` : '',
        fg: PALETTE.text,
        flatFg: PALETTE.inkGreen,
        bg: PALETTE.gitClean,
      }),
    ];

    // Line 3 — the catch-all: anything the two rows above did not claim. A status often
    // repeats its own key and carries its own colours, so both are normalised away here:
    // the key is dropped when the value already says it, and the palette wins.
    const statusSegments: Segment[] = [...footerData.getExtensionStatuses().entries()]
      .slice(0, config.maxStatusItems)
      .map(([key, text]) => {
        const value = stripAnsi(text);
        const keyRoot = key.toLowerCase().split(/[-_.\s]/)[0] ?? key.toLowerCase();
        const repeatsKey =
          value.toLowerCase().includes(key.toLowerCase()) ||
          (keyRoot.length >= 3 && value.toLowerCase().startsWith(keyRoot));

        return {
          text: value,
          ...(repeatsKey ? {} : { prefix: key }),
          prefixFg: PALETTE.dim,
          fg: PALETTE.activityFg,
          flatFg: PALETTE.inkTeal,
          bg: PALETTE.activity,
          collapse: 1,
        };
      });

    const reported: Segment[] = config.segments.statuses ? [...statusSegments] : [];

    const extra = (prefix: string, text: string): Segment => ({
      text,
      prefix,
      prefixFg: PALETTE.dim,
      fg: PALETTE.activityFg,
      flatFg: PALETTE.inkText,
      bg: PALETTE.activity,
      collapse: 0,
    });

    if (config.segments.tokens && usage?.tokens != null)
      reported.push(extra('ctx', `${compact(usage.tokens)}/${compact(usage.contextWindow)}`));

    const providers = footerData.getAvailableProviderCount();
    if (config.segments.providers && providers > 1) reported.push(extra('providers', String(providers)));

    return [working, place, reported];
  };

  return {
    layout,
    render(ctx, footerData, width) {
      const rows = buildLines(ctx, footerData)
        .map((segments, index) => renderLine(segments, width, layout.styles[index] ?? 'flat'))
        // A row with nothing to show is dropped, so an empty row never costs a line.
        .filter((line) => line.length > 0);
      return rows;
    },
    turnStart() {
      streaming = true;
      startSpinner();
      requestRender();
    },
    turnEnd() {
      streaming = false;
      stopSpinner();
      requestRender();
    },
    toolStart(toolCallId, toolName) {
      activeTools.set(toolCallId, toolName);
      requestRender();
    },
    toolEnd(toolCallId) {
      activeTools.delete(toolCallId);
      requestRender();
    },
    messageStart(role) {
      rates.begin(role, Date.now());
    },
    messageToken(role) {
      rates.firstToken(role, Date.now());
    },
    messageEnd(role, usage) {
      rates.end(role, usage, Date.now());
      requestRender();
    },
    refresh() {
      requestRender();
    },
    dispose() {
      stopSpinner();
    },
  };
}
