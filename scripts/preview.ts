/**
 * Renders the footer bar without a terminal, at several widths, styles and states, so a
 * change can be eyeballed before it is installed into pi.
 *
 *   node scripts/preview.ts      (or: npm run preview)   -> .tmp/preview.html
 *   any browser / playwright                             -> open that file over http
 *
 * The bar is driven by a fake pi: handlers are recorded, a fake ctx answers the footer
 * query, then events are replayed to reproduce "thinking", "running a tool", and "idle".
 * ANSI truecolor sequences are converted to CSS, so the output matches the terminal.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import piBar from '../src/index.ts';
import { layout } from '../src/layout.ts';
import { PALETTE, type RGB } from '../src/palette.ts';

type LineStyle = 'block' | 'flat';

const handlers = new Map<string, ((...args: any[]) => void)[]>();
let footerFactory: any = null;

const pi: any = {
  on(event: string, handler: (...args: any[]) => void) {
    handlers.set(event, [...(handlers.get(event) ?? []), handler]);
  },
};
const emit = (event: string, ...args: unknown[]): void => {
  for (const handler of handlers.get(event) ?? []) handler(...args);
};

const ctx: any = {
  hasUI: true,
  cwd: process.cwd(),
  model: { id: 'group/deepseek-flash' },
  thinkingLevel: 'medium',
  getContextUsage: () => ({ tokens: 118000, contextWindow: 200000, percent: 59 }),
  ui: {
    setWorkingVisible() {},
    notify() {},
    setFooter(factory: any) {
      footerFactory = factory;
    },
  },
};

/** Line 3 is fed from other extensions' ctx.ui.setStatus() keys. */
let statuses = new Map<string, string>([
  ['todo', '3/8'],
  ['mcp', '2'],
]);
let branch: string | null = 'main';

piBar(pi);
emit('session_start', {}, ctx);
const component = footerFactory(
  { requestRender() {} },
  {},
  {
    getGitBranch: () => branch,
    getExtensionStatuses: () => statuses,
    getAvailableProviderCount: () => 2,
    onBranchChange: () => () => {},
  },
);

// One finished request, so the rates have something to show. A script finishes in micro-
// seconds, so the clock is faked to a plausible 5.2 second wait for the whole answer.
const realNow = Date.now;
let clock = 0;
Date.now = () => clock;
emit('message_start', { message: { role: 'assistant' } });
clock += 5200;
emit('message_end', { message: { role: 'assistant', usage: { input: 24_000, cacheRead: 96_000, output: 620 } } });
Date.now = realNow;

// One finished tool, so the second row has change counts to show. They arrive asynchronously
// from git, hence the short wait before anything is rendered.
emit('tool_execution_end', { toolCallId: 'preview', toolName: 'edit' }, ctx);
await new Promise((resolve) => setTimeout(resolve, 500));

const toHtml = (line: string): string => {
  let out = '';
  let fgColor = '';
  let bgColor = '';
  for (const part of line.split(/(\x1b\[[0-9;]*m)/)) {
    const match = /^\x1b\[([0-9;]*)m$/.exec(part);
    if (match) {
      const codes = match[1]!.split(';').map(Number);
      if (codes.length === 5 && codes[0] === 38) fgColor = `rgb(${codes[2]},${codes[3]},${codes[4]})`;
      else if (codes.length === 5 && codes[0] === 48) bgColor = `rgb(${codes[2]},${codes[3]},${codes[4]})`;
      else if (codes[0] === 0) {
        fgColor = '';
        bgColor = '';
      }
      continue;
    }
    if (part === '') continue;
    const style = `${fgColor ? `color:${fgColor};` : ''}${bgColor ? `background:${bgColor};` : ''}`;
    out += `<span style="${style}">${part.replace(/ /g, '&nbsp;')}</span>`;
  }
  return out;
};

const rows: Array<[string, string[]]> = [];
const shot = (label: string, width: number): void => {
  const lines = (component.render(width) as string[]).filter((line) => line.length > 0);
  rows.push([`${label} · ${lines.length} 行`, lines]);
};

const stylesOf = (style: LineStyle, count = 3): LineStyle[] => [style, style, style].slice(0, count);

for (const [name, style] of [
  ['分层：块 / 平 / 平', 'mixed'],
  ['全块', 'block'],
  ['全平', 'flat'],
] as const) {
  layout.styles = style === 'mixed' ? ['block', 'flat', 'flat'] : stylesOf(style);
  shot(`${name} · 150 列`, 150);
  shot(`${name} · 60 列`, 60);
}

// `chips` is the same geometry on every row with the quiet backgrounds muted, so the sample
// swaps the two live values the render path reads instead of rebuilding the bar.
const cleanGreen = PALETTE.gitClean;
PALETTE.gitClean = PALETTE.quietClean;
layout.styles = ['block', 'block', 'block'];
shot('同族 chip · 150 列', 150);
shot('同族 chip · 60 列', 60);
PALETTE.gitClean = cleanGreen;

layout.styles = ['block', 'flat', 'flat'];
for (const width of [150, 110, 80, 60, 45, 30]) shot(`${width} 列`, width);

// Row-one backgrounds, three candidates. The palette is live state, so the same render
// code can be judged side by side instead of being argued about.
type BlockPalette = Partial<Pick<typeof PALETTE, 'activity' | 'model' | 'thinking' | 'ok' | 'warn' | 'alert'>>;

const original: BlockPalette = {
  activity: PALETTE.activity,
  model: PALETTE.model,
  thinking: PALETTE.thinking,
  ok: PALETTE.ok,
  warn: PALETTE.warn,
  alert: PALETTE.alert,
};

const candidates: Array<[string, BlockPalette]> = [
  ['A 现行', original],
  [
    'B 三段分色',
    {
      activity: [14, 116, 144],
      model: [30, 64, 175],
      thinking: [91, 33, 182],
      ok: [21, 128, 61],
      warn: [180, 83, 9],
      alert: [185, 28, 28],
    },
  ],
  [
    'C 单强调',
    {
      activity: [15, 118, 110],
      model: [59, 66, 82],
      thinking: [59, 66, 82],
      ok: [22, 101, 52],
      warn: [146, 64, 14],
      alert: [153, 27, 27],
    },
  ],
];

emit('turn_start', {});
for (const [name, colors] of candidates) {
  Object.assign(PALETTE, colors as Record<keyof BlockPalette, RGB>);
  shot(`配色 ${name} · 150 列`, 150);
  shot(`配色 ${name} · 60 列`, 60);
}
Object.assign(PALETTE, original as Record<keyof BlockPalette, RGB>);
emit('turn_end', {}, ctx);

// Streaming with no tool yet: the turn has started, the model is thinking.
emit('turn_start', {});
// Let the turn timer tick once, so the preview shows an elapsed figure instead of nothing.
await new Promise((resolve) => setTimeout(resolve, 1200));
shot('思考中', 150);
shot('思考中 · 45 列', 45);

// A tool runs mid-turn.
emit('tool_execution_start', { toolCallId: 't1', toolName: 'bash' });
shot('运行工具', 150);
emit('tool_execution_end', { toolCallId: 't1', toolName: 'bash' }, ctx);

emit('turn_end', {}, ctx);
shot('空闲', 150);

ctx.getContextUsage = () => ({ tokens: 182000, contextWindow: 200000, percent: 91 });
shot('上下文 91%', 150);
ctx.getContextUsage = () => ({ tokens: 118000, contextWindow: 200000, percent: 59 });

// A dirty branch, and a detached head.
branch = 'feat/three-lines';
shot('另一分支', 150);
branch = null;
shot('非 git 目录', 150);
branch = 'main';

// Line 3 is the only thing that grows: three status keys, then none at all.
statuses = new Map([
  ['todo', '3/8'],
  ['mcp', '2'],
  ['lint', 'ok'],
]);
shot('三个状态键', 150);
shot('三个状态键 · 60 列', 60);
// The crowded case that came out of a real session: eight status texts, many of which
// repeat their own key and carry their own colours.
statuses = new Map([
  ['audit', '\u25CB'],
  ['mcp', '\u{1F50C} MCP: 12 servers enabled'],
  ['fzf-files', 'fzf: 124 entries'],
  ['ponytail', '\u25CF \u{1F434} ponytail: \u{1F525} ULTRA'],
  ['pi-cache-stats', '\u00B7 DS cache 447/463\u00B743.2M/45.5M 95.0%'],
  ['pi-ide', '\u25C6'],
  ['lsp', 'LSP: idle'],
  ['langfuse', 'langfuse: off (no keys)'],
]);
ctx.getContextUsage = () => ({ tokens: 125058, contextWindow: 1048576, percent: 11.9 });
shot('真实会话 · 209 列', 209);
shot('真实会话 · 120 列', 120);
ctx.getContextUsage = () => ({ tokens: 118000, contextWindow: 200000, percent: 59 });
statuses = new Map();
shot('没有状态键', 150);
component.dispose();

const html = `<!doctype html><meta charset="utf-8">
<style>
  body { background:#11111b; color:#cdd6f4; font-family:"Cascadia Mono","JetBrainsMono Nerd Font","Consolas",monospace; padding:24px 24px 64px; }
  .row { display:flex; align-items:flex-start; gap:18px; margin:14px 0; }
  .label { width:150px; color:#6c7086; font-size:13px; text-align:right; padding-top:4px; }
  .bar { font-size:17px; white-space:pre; line-height:1.5; }
  .frame { border-left:2px solid #45475a; padding-left:14px; min-height:26px; }
</style>
${rows
  .map(
    ([label, lines]) =>
      `<div class="row"><div class="label">${label}</div><div class="frame"><div class="bar">${lines
        .map(toHtml)
        .join('<br>')}</div></div></div>`,
  )
  .join('\n')}
`;
const outDir = new URL('../.tmp/', import.meta.url);
mkdirSync(outDir, { recursive: true });
const outFile = new URL('preview.html', outDir);
writeFileSync(outFile, html);
console.log(`wrote ${fileURLToPath(outFile)}`);
