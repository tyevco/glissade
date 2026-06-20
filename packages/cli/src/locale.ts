/**
 * gs render --locale <code> (0.14 localization core): resolve the per-locale
 * message table + the locale-tagged narration timing sibling for a scene module.
 *
 * The render-time half of @glissade/core/i18n. The base (no --locale) path
 * resolves the BASE files (`messages.json` is NOT consulted, the base narration
 * sibling is used) → byte-identical to today. Every locale is opt-in.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { MessageTable } from '@glissade/core/i18n';

/** Strip a scene module's `.ts`/`.tsx`/`.js`/`.jsx` extension → the file stem. */
function moduleStem(modulePath: string): string {
  return modulePath.replace(/\.[jt]sx?$/, '');
}

/**
 * The locale-tagged NARRATION timing sibling suffix. A `--locale xx` render
 * prefers `<base>.xx.narration.timing.json` over the base
 * `<base>.narration.timing.json`. DEFAULT convention — the maintainer is
 * confirming the exact suffix with the ai-training consumer; changing it is a
 * one-line edit HERE. `%s` is the locale code.
 */
export const LOCALE_NARRATION_SUFFIX = '.%s.narration.timing.json';

/**
 * The per-locale message table filename, resolved RELATIVE to the scene module
 * directory: `messages.<locale>.json`. DEFAULT convention; one-line change.
 */
export function messagesFileFor(modulePath: string, locale: string): string {
  return join(dirname(modulePath), `messages.${locale}.json`);
}

/**
 * Load the message table for a locale, or `undefined` when no `messages.<locale>.json`
 * exists (a locale with only node-id / narration text and no free-standing t()
 * keys is valid). The base path never calls this.
 */
export function loadMessageTable(modulePath: string, locale: string): MessageTable | undefined {
  const file = messagesFileFor(modulePath, locale);
  if (!existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, 'utf8')) as MessageTable;
}

/**
 * The locale-tagged narration timing sibling path for a module, or `undefined`
 * when no `locale` is requested. The render path prefers this sibling when it
 * exists, falling back to the base sibling otherwise (so a locale that reuses
 * the base narration still renders).
 */
export function localeNarrationPathFor(modulePath: string, locale: string): string {
  return moduleStem(modulePath) + LOCALE_NARRATION_SUFFIX.replace('%s', locale);
}

/**
 * A declared `--locale <code>` resolved to NEITHER a `messages.<code>.json` nor a
 * `<base>.<code>.narration.timing.json` sibling — the locale has no assets at
 * all, so a render would silently fall back to the BASE artifact (wrong-language
 * output, exit 0, no warning). Render hard-throws this instead.
 *
 * (A narration-only locale legitimately has no messages file, and a
 * messages-only locale legitimately reuses the base narration — so this fires
 * only when BOTH are absent.)
 */
export class UnknownLocaleError extends Error {
  constructor(locale: string, messagesPath: string, narrationPath: string) {
    super(
      `--locale '${locale}': no locale assets found — neither a message table nor a narration sibling resolves. ` +
        `Looked for '${messagesPath}' and '${narrationPath}'. ` +
        `Add one of those files, or drop --locale to render the base language.`,
    );
    this.name = 'UnknownLocaleError';
  }
}
