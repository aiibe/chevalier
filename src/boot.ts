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
  // Escape `<` so a props string value can't break out of the </script>.
  const propsJson = JSON.stringify(props).replace(/</g, "\\u003c");
  return [
    `import { hydrateIslands } from ${JSON.stringify(clientEntry)};`,
    ...imports,
    `hydrateIslands([${components.join(",")}],${propsJson});`,
  ].join("\n");
}
