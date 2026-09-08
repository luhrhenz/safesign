/** Small helpers shared by the rule files. */

/** Comments are full of red-flag words. Strip them before pattern matching. */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/** The matched line, trimmed and capped — used as `evidence` on a finding. */
export function snippet(source: string, re: RegExp): string | undefined {
  const match = re.exec(source);
  if (!match) return undefined;
  const start = source.lastIndexOf("\n", match.index) + 1;
  const end = source.indexOf("\n", match.index);
  const line = source.slice(start, end === -1 ? undefined : end).trim();
  return line.length > 160 ? `${line.slice(0, 157)}...` : line;
}
