/**
 * The bar itself: three rows, each rendered from the same snapshot.
 *
 * Row roles follow how fast the data changes, so the eye lands on the row that is moving:
 * `working` (seconds), `place` (minutes-to-hours), `reported` (whatever extensions push).
 * A row with nothing to say is dropped, so an idle session costs two rows, not three.
 */
import type { ExtensionContext, ReadonlyFooterDataProvider } from '@earendil-works/pi-coding-agent';
import type { TUI } from '@earendil-works/pi-tui';
import { layout, renderLine, type Segment } from './layout.ts';
import { PALETTE } from './palette.ts';

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export interface Bar {
  /** Rows for the current width; the caller owns adding the trailing spacer row. */
  render(ctx: ExtensionContext, footerData: ReadonlyFooterDataProvider, width: number): string[];
  turnStart(): void;
  turnEnd(): void;
  toolStart(toolCallId: string, toolName: string): void;
  toolEnd(toolCallId: string): void;
  /** Ask pi to redraw, for changes it does not announce itself. */
  refresh(): void;
  readonly layout: typeof layout;
  dispose(): void;
}

export function createBar(tui: TUI): Bar {
  let spinnerFrame = 0;
  let spinnerTimer: ReturnType<typeof setInterval> | null = null;
  let streaming = false;
  const activeTools = new Map<string, string>();

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

  const buildLines = (
    ctx: ExtensionContext,
    branch: string | null,
    statuses: ReadonlyMap<string, string>,
  ): Segment[][] => {
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

    // Line 1 — what the agent is doing right now.
    const working: Segment[] = [
      {
        text: activityText(),
        fg: PALETTE.activityFg,
        flatFg: PALETTE.inkTeal,
        bg: PALETTE.activity,
        collapse: 5,
        collapsed: frame(),
      },
      {
        text: model,
        fg: PALETTE.text,
        flatFg: PALETTE.inkBlue,
        bg: PALETTE.model,
        collapse: 3,
        collapsed: model.split('/').pop() ?? model,
      },
      {
        text: thinking === '' ? 'think:off' : thinking,
        fg: PALETTE.text,
        flatFg: PALETTE.inkTeal,
        bg: PALETTE.thinking,
        collapse: 2,
      },
      {
        text: percent === null ? '--' : `${Math.round(percent)}%`,
        fg: PALETTE.text,
        flatFg: contextInk,
        bg: contextBg,
        collapse: 4,
      },
    ];

    // Line 2 — where the work is happening.
    const place: Segment[] = [
      {
        text: `\u{F07B} ${dirName}`,
        fg: PALETTE.text,
        flatFg: PALETTE.inkText,
        bg: PALETTE.dir,
        collapse: 1,
      },
      {
        text: branch ? `\u{E0A0} ${branch}` : '',
        fg: PALETTE.text,
        flatFg: PALETTE.inkGreen,
        bg: PALETTE.gitClean,
      },
    ];

    // Line 3 — what other extensions report, one segment per status key.
    const reported: Segment[] = [...statuses.entries()].map(([key, text]) => ({
      text,
      prefix: key,
      prefixFg: PALETTE.dim,
      fg: PALETTE.activityFg,
      flatFg: PALETTE.inkTeal,
      bg: PALETTE.activity,
      collapse: 0,
    }));

    return [working, place, reported];
  };

  return {
    layout,
    render(ctx, footerData, width) {
      const rows = buildLines(ctx, footerData.getGitBranch(), footerData.getExtensionStatuses())
        .map((segments, index) => renderLine(segments, width, layout.styles[index] ?? 'flat'))
        // A row with nothing to show is dropped, so an empty row never costs a line.
        .filter((line) => line.length > 0);
      return [...rows, ''];
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
    refresh() {
      requestRender();
    },
    dispose() {
      stopSpinner();
    },
  };
}
