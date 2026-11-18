/**
 * User configuration: one optional TOML file in the agent directory, read at startup.
 *
 * The file is a place to turn rows and segments on or off and to repaint them, not a
 * programming surface — anything it cannot express has to earn a key here first. A file
 * that is missing is normal (defaults), a file that is broken is reported and skipped, so
 * a bad edit never leaves the bar blank.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse } from 'smol-toml';
import type { LineStyle } from './layout.ts';
import { PALETTE, type RGB } from './palette.ts';

export type BarStyle = 'mixed' | 'chips' | LineStyle;

export interface SegmentToggles {
  activity: boolean;
  model: boolean;
  thinking: boolean;
  context: boolean;
  rates: boolean;
  cwd: boolean;
  branch: boolean;
  changes: boolean;
  statuses: boolean;
  tokens: boolean;
  providers: boolean;
}

export interface BarConfig {
  style: BarStyle;
  segments: SegmentToggles;
  maxStatusItems: number;
  /** Seconds of history the rates average over; 0 means the whole session. */
  rateWindowSeconds: number;
  colors: Partial<Record<keyof typeof PALETTE, RGB>>;
}

export const DEFAULT_CONFIG: BarConfig = {
  style: 'mixed',
  segments: {
    activity: true,
    model: true,
    thinking: true,
    context: true,
    rates: true,
    cwd: true,
    branch: true,
    changes: true,
    statuses: true,
    tokens: true,
    providers: true,
  },
  maxStatusItems: 6,
  rateWindowSeconds: 0,
  colors: {},
};

/**
 * `~/.pi/agent/pi-bar.toml`, written by the user, never created by the plugin.
 * `PI_BAR_CONFIG` points somewhere else so a test never reads the real file.
 */
export const configPath = (): string =>
  process.env.PI_BAR_CONFIG?.trim() || join(homedir(), '.pi', 'agent', 'pi-bar.toml');

const styles = ['mixed', 'chips', 'block', 'flat'] as const;

/** Upper bound for `rate.window`: a longer window says nothing a session average does not. */
const MAX_RATE_WINDOW_SECONDS = 120;

/** `#rrggbb` only: a named terminal colour would not survive the truecolour escapes we emit. */
const parseHex = (value: string): RGB | undefined => {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (match?.[1] === undefined) return undefined;

  const hex = match[1];
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Turn parsed TOML into a config. Unknown keys are ignored on purpose: a typo costs a
 * warning, never a crash, and the default stays in place.
 */
export function readConfig(raw: unknown, warn: (message: string) => void = () => {}): BarConfig {
  const config: BarConfig = {
    ...DEFAULT_CONFIG,
    segments: { ...DEFAULT_CONFIG.segments },
    colors: {},
  };

  if (!isRecord(raw)) return config;

  const layout = raw.layout;
  if (isRecord(layout) && typeof layout.style === 'string') {
    const style = layout.style.trim();
    if ((styles as readonly string[]).includes(style)) config.style = style as BarStyle;
    else warn(`layout.style: expected one of ${styles.join(', ')}, got ${style}`);
  }

  const segments = raw.segments;
  if (isRecord(segments)) {
    for (const key of Object.keys(DEFAULT_CONFIG.segments) as Array<keyof SegmentToggles>) {
      const value = segments[key];
      if (value === undefined) continue;
      if (typeof value === 'boolean') config.segments[key] = value;
      else warn(`segments.${key}: expected true or false`);
    }
  }

  const statuses = raw.statuses;
  if (isRecord(statuses) && statuses.max_items !== undefined) {
    const value = statuses.max_items;
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) config.maxStatusItems = value;
    else warn('statuses.max_items: expected a whole number of 0 or more');
  }

  const rate = raw.rate;
  if (isRecord(rate) && rate.window !== undefined) {
    const value = rate.window;
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_RATE_WINDOW_SECONDS)
      config.rateWindowSeconds = value;
    else warn(`rate.window: expected a whole number of seconds from 0 to ${MAX_RATE_WINDOW_SECONDS}`);
  }

  const colors = raw.colors;
  if (isRecord(colors)) {
    for (const [key, value] of Object.entries(colors)) {
      if (!(key in PALETTE)) {
        warn(`colors.${key}: no such colour`);
        continue;
      }
      if (typeof value !== 'string') {
        warn(`colors.${key}: expected a "#rrggbb" string`);
        continue;
      }

      const rgb = parseHex(value);
      if (rgb === undefined) warn(`colors.${key}: expected a "#rrggbb" string, got ${value}`);
      else config.colors[key as keyof typeof PALETTE] = rgb;
    }
  }

  return config;
}

export interface LoadResult {
  config: BarConfig;
  /** Human-readable problems, one per line, empty when the file is absent or clean. */
  warnings: string[];
}

export function loadConfig(path: string = configPath()): LoadResult {
  const warnings: string[] = [];
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    // No file is the normal case, not an error worth reporting.
    return { config: readConfig({}), warnings };
  }

  let raw: unknown;
  try {
    raw = parse(text);
  } catch (error) {
    warnings.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
    return { config: readConfig({}), warnings };
  }

  return { config: readConfig(raw, (message) => warnings.push(`${path}: ${message}`)), warnings };
}

/** Paint the palette from the config; called once, before the first render. */
export function applyColors(config: BarConfig): void {
  Object.assign(PALETTE, config.colors);
}

/** The file a fresh install gets, commented so every key is discoverable by reading it. */
export const TEMPLATE = `# pi-bar settings. Restart pi after an edit — the file is read once per session.

[layout]
# mixed (default): row 1 in cells, the two quiet rows as text. "chips": every row in cells,
# the quiet ones on slate. Or "block" / "flat" for all three rows.
style = "mixed"

[segments]
activity = true   # spinner and running tool names
model = true      # model name
thinking = true   # thinking level
context = true    # context percentage
rates = true      # in/out tokens per second over the session
cwd = true        # working directory
branch = true     # git branch
changes = true    # +added / -removed lines in the working tree
statuses = true   # extension statuses on the third row
tokens = true     # ctx 125K/1M on the third row
providers = true  # provider count, only shown above one

[statuses]
# How many extension statuses the third row may show.
max_items = 6

[rate]
# Seconds of history the rates average over, 0-120. 0 (default) averages the whole session.
# A window follows a burst instead of the session, at the cost of a reading that moves.
window = 0

[colors]
# \`#rrggbb\` overrides, e.g. model = "#005b95". Palette names: text, dim, sep,
# inkText, inkBlue, inkTeal, inkGreen, inkYellow, inkRed, model, thinking, dir,
# activity, activityFg, gitClean, ok, warn, alert.
`;

/**
 * Create the default file on first run so the keys are discoverable. An existing file is
 * never touched, and a path that cannot be written is ignored: the bar works without it.
 */
export function ensureConfigFile(path: string = configPath()): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, TEMPLATE, { flag: 'wx' });
  } catch {
    // Either the file is already there or the directory is read-only; both are fine.
  }
}
