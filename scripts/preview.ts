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
  cwd: 'C:\\Users\\Administrator\\.pi\\agent\\git\\github.com\\mystery4f\\pi-bar',
  model: { id: 'group/deepseek-flash' },
  thinkingLevel: 'medium',
  getContextUsage: () => ({ tokens: 118000, contextWindow: 200000, percent: 59 }),
  ui: {
    setWorkingVisible() {},
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
  },
);

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

layout.styles = ['block', 'flat', 'flat'];
for (const width of [150, 110, 80, 60, 45, 30]) shot(`${width} 列`, width);

// Streaming with no tool yet: the turn has started, the model is thinking.
emit('turn_start', {});
shot('思考中', 150);
shot('思考中 · 45 列', 45);

// A tool runs mid-turn.
emit('tool_execution_start', { toolCallId: 't1', toolName: 'bash' });
shot('运行工具', 150);
emit('tool_execution_end', { toolCallId: 't1', toolName: 'bash' });

emit('turn_end', {});
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
