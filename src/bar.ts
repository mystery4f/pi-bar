/**
 * The bar itself: three rows, each rendered from the same snapshot.
 *
 * Row roles follow how fast the data changes, so the eye lands on the row that is moving:
 * `working` (seconds), `place` (minutes-to-hours), `reported` (whatever extensions push).
 * A row with nothing to say is dropped, so an idle session costs two rows, not three.
 */
import type { ExtensionContext, ReadonlyFooterDataProvider } from '@earendil-works/pi-coding-agent';
import type { TUI } from '@earendil-works/pi-tui';
import type { BarConfig, BarStyle } from './config.ts';
import { type ChangeCounts, NO_UPSTREAM, readChangeCounts, readUpstreamCounts, type UpstreamCounts } from './git.ts';
import { type LineStyle, layout, renderLine, type Segment } from './layout.ts';
import { PALETTE, stripAnsi } from './palette.ts';
import { createRateMeter, type RateSample, type TokenUsage } from './rates.ts';

/**
 * `PI_BAR_DEBUG_RATES=1` prints the raw measurement behind each rate, so an implausible number
 * can be compared with the window it came from instead of guessed at.
 */
const logRateSample = (sample: RateSample): void => {
  if (process.env.PI_BAR_DEBUG_RATES !== '1') return;

  console.error(
    `pi-bar rate input=${sample.inputTokens} output=${sample.outputTokens} durationMs=${sample.durationMs}`,
  );
};
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
  messageEnd(role: string, usage: TokenUsage | undefined): void;
  toolStart(toolCallId: string, toolName: string): void;
  toolEnd(toolCallId: string): void;
  /** Ask pi to redraw, for changes it does not announce itself. */
  refresh(): void;
  /** Re-read the working tree; the bar repaints only when the counts move. */
  updateChanges(cwd: string): void;
  readonly layout: typeof layout;
  dispose(): void;
}

/** Rows per style: `mixed` leads with cells, `chips` gives every row the same cells, the rest repeat. */
const rowStyles = (style: BarStyle): LineStyle[] => {
  if (style === 'mixed') return ['block', 'flat', 'flat'];
  if (style === 'chips') return ['block', 'block', 'block'];

  return [style, style, style];
};

/**
 * A quiet row in chips style keeps its cells but drops the green branch for slate, so the row
 * shares the family's geometry without pulling the eye away from the working row.
 */
const quiet = (segment: Segment): Segment =>
  segment.bg === PALETTE.gitClean ? { ...segment, bg: PALETTE.quietClean } : segment;

export function createBar(tui: TUI, config: BarConfig): Bar {
  layout.styles = rowStyles(config.style);

  let spinnerFrame = 0;
  let spinnerTimer: ReturnType<typeof setInterval> | null = null;
  let streaming = false;
  const activeTools = new Map<string, string>();
  const rates = createRateMeter({ windowMs: config.rateWindowSeconds * 1000, onSample: logRateSample });
  let changes: ChangeCounts = { files: 0, insertions: 0, deletions: 0 };
  let upstream: UpstreamCounts = NO_UPSTREAM;
  let turnStartedAt: number | null = null;
  let lastTurnMs: number | null = null;
  let clockTimer: ReturnType<typeof setInterval> | null = null;

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
  /** The elapsed segment counts seconds, so one repaint a second keeps it honest. */
  const startClock = (): void => {
    if (clockTimer !== null) return;

    clockTimer = setInterval(() => {
      requestRender();
    }, 1000);
  };

  const stopClock = (): void => {
    if (clockTimer === null) return;

    clearInterval(clockTimer);
    clockTimer = null;
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

  /** Rates read as `42 t/s`, `5.7k t/s` — one fixed unit, `k` only scaling the magnitude. */
  const rateText = (perSecond: number): string => {
    if (perSecond < 1000) return `${perSecond} t/s`;

    return `${(perSecond / 1000).toFixed(1).replace(/\.0$/, '')}k t/s`;
  };

  /** Turn time reads as `12s` under a minute and `1m05s` above it. */
  const durationText = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);

    if (seconds < 60) return `${seconds}s`;

    return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`;
  };

  /** Time the current turn has been running, or how long the last one took. */
  const elapsedMs = (): number | null => (turnStartedAt === null ? lastTurnMs : Date.now() - turnStartedAt);

  /** `\u21912\u21931`: unpushed commits first, then commits waiting upstream. */
  const upstreamText = (): string => {
    const ahead = upstream.ahead > 0 ? `\u2191${upstream.ahead}` : '';
    const behind = upstream.behind > 0 ? `\u2193${upstream.behind}` : '';

    return `${ahead}${behind}`;
  };
  /** Session throughput, in tokens per second. */
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
    const modelId = ctx.model?.id ?? 'no model';
    const provider = ctx.model?.provider ?? '';
    // The provider is what tells two sessions apart when the same id is served twice.
    const model = provider === '' || modelId.startsWith(`${provider}/`) ? modelId : `${provider}/${modelId}`;
    const thinking = ctx.thinkingLevel ?? '';
    const usage = ctx.getContextUsage();
    const percent = usage?.percent ?? null;
    const elapsed = elapsedMs();
    const dirName = ctx.cwd.split(/[\\/]/).filter(Boolean).pop() ?? ctx.cwd;
    const sessionName = ctx.sessionManager.getSessionName() ?? '';

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
        flatFg: PALETTE.inkText,
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
        collapsed: modelId.split('/').pop() ?? modelId,
      }),
      ...keep(config.segments.thinking, {
        text: thinking === '' ? 'think:off' : thinking,
        fg: PALETTE.text,
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
      ...keep(config.segments.elapsed && (elapsed ?? 0) > 0, {
        text: durationText(elapsed ?? 0),
        fg: PALETTE.text,
        flatFg: PALETTE.dim,
        bg: PALETTE.dir,
        collapse: 3,
      }),
      ...(rate?.input === undefined ? [] : [rateSegment('in', rate.input)]),
      ...(rate?.output === undefined ? [] : [rateSegment('out', rate.output)]),
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
      // The name pi gives a session (`/name` or `--name`) beside the folder it runs in: two
      // sessions in one checkout are told apart by this segment alone. An unnamed session
      // has nothing to say, so it costs no space.
      ...keep(config.segments.session && sessionName !== '', {
        text: sessionName,
        fg: PALETTE.text,
        bg: PALETTE.thinking,
        collapse: 1,
      }),
      ...keep(config.segments.branch, {
        text: branch ? `\u{E0A0} ${branch}` : '',
        fg: PALETTE.text,
        flatFg: PALETTE.inkGreen,
        bg: PALETTE.gitClean,
      }),
      ...keep(config.segments.upstream && upstream.ahead + upstream.behind > 0, {
        text: upstreamText(),
        fg: PALETTE.inkText,
        flatFg: PALETTE.inkText,
        bg: PALETTE.dir,
        collapse: 2,
      }),
      // How much of the tree moved, before how many lines moved: a file count is what turns
      // "+4 -880" from a scare into a sentence. The label reads `Edits • 12 files • +98 -7`,
      // the numbers as plain coloured text, so the group stays quieter than the branch above it.
      ...keep(config.segments.changes && changes.files > 0, {
        text: `Edits \u2022 ${changes.files} file${changes.files === 1 ? '' : 's'} \u2022`,
        fg: PALETTE.inkText,
        flatFg: PALETTE.dim,
        bg: PALETTE.activity,
        join: true,
        collapse: 3,
      }),
      // Both halves stay silent at zero: a clean tree says nothing, and one-sided edits half a bar.
      ...keep(config.segments.changes && changes.insertions > 0, {
        text: `+${changes.insertions}`,
        fg: PALETTE.inkGreen,
        flatFg: PALETTE.inkGreen,
        bg: PALETTE.activity,
        join: true,
        collapse: 3,
      }),
      ...keep(config.segments.changes && changes.deletions > 0, {
        text: `-${changes.deletions}`,
        fg: PALETTE.inkRed,
        flatFg: PALETTE.inkRed,
        bg: PALETTE.activity,
        join: true,
        collapse: 3,
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
          flatFg: PALETTE.inkText,
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
        .map((segments, index) => {
          const shown = config.style === 'chips' && index > 0 ? segments.map(quiet) : segments;

          return renderLine(shown, width, layout.styles[index] ?? 'flat');
        })
        // A row with nothing to show is dropped, so an empty row never costs a line.
        .filter((line) => line.length > 0);
      return rows;
    },
    turnStart() {
      streaming = true;
      turnStartedAt = Date.now();
      lastTurnMs = null;
      startSpinner();
      startClock();
      requestRender();
    },
    turnEnd() {
      streaming = false;
      lastTurnMs = turnStartedAt === null ? lastTurnMs : Date.now() - turnStartedAt;
      turnStartedAt = null;
      stopSpinner();
      stopClock();
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
    messageEnd(role, usage) {
      rates.end(role, usage, Date.now());
      requestRender();
    },
    refresh() {
      requestRender();
    },
    updateChanges(cwd) {
      void Promise.all([readChangeCounts(cwd), readUpstreamCounts(cwd)]).then(([nextChanges, nextUpstream]) => {
        const moved =
          nextChanges.files !== changes.files ||
          nextChanges.insertions !== changes.insertions ||
          nextChanges.deletions !== changes.deletions ||
          nextUpstream.ahead !== upstream.ahead ||
          nextUpstream.behind !== upstream.behind;

        if (!moved) return;

        changes = nextChanges;
        upstream = nextUpstream;
        requestRender();
      });
    },
    dispose() {
      stopSpinner();
    },
  };
}
