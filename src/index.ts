/**
 * Entry point: wire the bar to session and agent events. No rendering decisions here —
 * those live in `bar.ts`, so this file stays readable as a list of what the bar reacts to.
 */
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { type Bar, createBar } from './bar.ts';
import { applyColors, ensureConfigFile, loadConfig } from './config.ts';

import type { TokenUsage } from './rates.ts';

/** Only assistant messages carry usage; the rest of the union is ignored. */
const usageOf = (message: unknown): TokenUsage | undefined => {
  const usage = (message as { usage?: TokenUsage }).usage;

  return usage;
};
export default function piBar(pi: ExtensionAPI): void {
  let bar: Bar | null = null;

  pi.on('session_start', (_event, ctx) => {
    if (!ctx.hasUI) return;

    ensureConfigFile();
    const { config, warnings } = loadConfig();
    applyColors(config);
    for (const warning of warnings) ctx.ui.notify(`pi-bar: ${warning}`, 'warning');

    ctx.ui.setWorkingVisible(false);
    ctx.ui.setFooter((tui, _theme, footerData) => {
      const created = createBar(tui, config);
      bar = created;
      return {
        dispose() {
          created.dispose();
          bar = null;
        },
        invalidate() {},
        render(width: number): string[] {
          return created.render(ctx, footerData, width);
        },
      };
    });
    bar?.updateChanges(ctx.cwd);
  });

  pi.on('model_select', () => bar?.refresh());
  pi.on('thinking_level_select', () => bar?.refresh());

  pi.on('turn_start', () => bar?.turnStart());
  pi.on('turn_end', (_event, ctx) => {
    bar?.turnEnd();
    bar?.updateChanges(ctx.cwd);
  });

  pi.on('tool_execution_start', (event) => bar?.toolStart(event.toolCallId, event.toolName));
  pi.on('tool_execution_end', (event, ctx) => {
    bar?.toolEnd(event.toolCallId);
    bar?.updateChanges(ctx.cwd);
  });
  pi.on('message_start', (event) => bar?.messageStart(event.message.role));
  pi.on('message_end', (event) => bar?.messageEnd(event.message.role, usageOf(event.message)));
}
