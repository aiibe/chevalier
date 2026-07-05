/**
 * Build the per-page boot module: imports each rendered island's chunk and calls
 * hydrateIslands with the component + deduped props arrays. Empty ids → "" (zero JS).
 */
export function buildBoot(
  ids: string[],
  props: Record<string, unknown>[],
  urls: Record<string, string>,
  clientEntry: string,
): string {
  if (ids.length === 0) return "";
  const imports = ids.map((id, i) =>
    `import * as m${i} from ${JSON.stringify(urls[id])};`
  );
  const components = ids.map((_id, i) => `m${i}.default`);
  const src = [
    `import { hydrateIslands } from ${JSON.stringify(clientEntry)};`,
    ...imports,
    `hydrateIslands([${components.join(",")}],${JSON.stringify(props)});`,
  ].join("\n");
  // Escape `<` across the whole module (props AND import URLs) so no
  // interpolated string can break out of the inline </script>.
  return src.replace(/</g, "\\u003c");
}
