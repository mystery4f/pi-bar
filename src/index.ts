/**
 * Entry point: wire the bar to session and agent events. No rendering decisions here —
 * those live in `bar.ts`, so this file stays readable as a list of what the bar reacts to.
 */
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { type Bar, createBar } from './bar.ts';
import { applyColors, loadConfig } from './config.ts';

export default function piBar(pi: ExtensionAPI): void {
  let bar: Bar | null = null;

  pi.on('session_start', (_event, ctx) => {
    if (!ctx.hasUI) return;

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
  });

  pi.on('model_select', () => bar?.refresh());
  pi.on('thinking_level_select', () => bar?.refresh());

  pi.on('turn_start', () => bar?.turnStart());
  pi.on('turn_end', () => bar?.turnEnd());

  pi.on('tool_execution_start', (event) => bar?.toolStart(event.toolCallId, event.toolName));
  pi.on('tool_execution_end', (event) => bar?.toolEnd(event.toolCallId));
}
