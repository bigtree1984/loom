const iconModules = import.meta.glob("../assets/icons/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const urlByKey = new Map<string, string>(
  Object.entries(iconModules).map(([path, url]) => [path.replace(/^.*\//, "").replace(/\.svg$/, ""), url]),
);

/** Looks up a downloaded icon by its registry key. Returns undefined (no
 * icon rendered, falls back to dot+label only) if the key has no SVG file
 * yet — new icon keys can be authored before the asset is downloaded. */
export function iconUrlFor(key: string | undefined): string | undefined {
  if (!key) return undefined;
  return urlByKey.get(key);
}
