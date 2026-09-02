/**
 * Helpers for the multi-module payload format used to present a code-split
 * Bun binary as a single patchable string.
 *
 * These live apart from `nativeInstallation.ts` so that consumers which must
 * not depend on `node-lief` -- which is optional and absent on some systems --
 * can still reason about the payload. `nativeInstallation.ts` re-exports them.
 */

/**
 * True if the module is one of the code-split chunks emitted alongside the
 * entrypoint.
 *
 * Claude Code >= 2.1.243 is built with Bun's code splitting enabled: the entry
 * module is a ~20 KB loader that `import`s ~1800 sibling `chunk-<hash>.js`
 * modules, and essentially all of the application source lives in those chunks
 * rather than in the entrypoint. Extracting only the entrypoint is why every
 * patch reports "not found" on those builds.
 *
 * The chunk hash is content-derived and changes on every Claude Code release,
 * so a chunk name is never worth persisting or targeting individually.
 */
export function isChunkModule(moduleName: string): boolean {
  return /(^|\/)chunk-[^/]+\.js$/.test(moduleName);
}

/**
 * Boundary marker used to present a code-split binary as a single string.
 *
 * `extractClaudeJsFromNativeInstallation()` hands callers one string so that a
 * patch can be written as a plain search-and-replace, but a code-split binary
 * has no single module to hand back. Concatenating the JS modules with a
 * boundary that names each one keeps that contract: the repack splits on the
 * same marker and routes every part back to the module it came from.
 *
 * The marker starts with a newline and is a `//` comment so that each module's
 * text stays valid, readable JavaScript.
 */
export const MODULE_BOUNDARY = '\n//#__tweakcc_module__:';

/**
 * The body of the payload's first module, which extraction orders to be the
 * program's entrypoint. Returns the content unchanged when it is not a
 * multi-module payload.
 *
 * Patches that inspect the start of the bundle need the entry module's own
 * first bytes; measuring from the start of a concatenated payload would include
 * the boundary line and, for anything beyond the first module, the wrong source
 * entirely.
 */
export function entryModuleBody(content: string): string {
  const parts = splitModulePayload(content);
  return parts && parts.length > 0 ? parts[0][1] : content;
}

/**
 * Splits a concatenated multi-module payload back into [name, contents] pairs.
 * Returns null if the payload is not in multi-module form.
 */
export function splitModulePayload(
  content: string
): Array<[string, string]> | null {
  if (!content.startsWith(MODULE_BOUNDARY)) {
    return null;
  }

  return content
    .split(MODULE_BOUNDARY)
    .slice(1) // leading '' before the first boundary
    .map(segment => {
      const nameEnd = segment.indexOf('\n');
      if (nameEnd === -1) {
        throw new Error('Malformed tweakcc module boundary: missing newline');
      }
      return [segment.slice(0, nameEnd), segment.slice(nameEnd + 1)] as [
        string,
        string,
      ];
    });
}
