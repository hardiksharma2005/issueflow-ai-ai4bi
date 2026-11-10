// Lightweight, deterministic duplicate detection (no embeddings, no paid API).
// Similarity = weighted Jaccard overlap of normalised word stems.

const STOPWORDS = new Set(
  "a an the and or but if then of on in at to for from by with is are was were be been it its this that these those i we you they he she our your their my me us can could should would will just not no yes please hi hello hey team again also still same any some there here when what which who how do does did have has had page app".split(
    " ",
  ),
);

export function tokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().normalize("NFKD").split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || STOPWORDS.has(raw)) continue;
    out.add(stem(raw));
  }
  return out;
}

function stem(word: string) {
  return word
    .replace(/ies$/, "y")
    .replace(/(ing|ed|es|s)$/, "")
    .replace(/(tion|ment)$/, "")
    .slice(0, 12);
}

export function jaccard(a: Set<string>, b: Set<string>) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

export interface Comparable {
  title: string;
  description?: string;
}

export function similarity(a: Comparable, b: Comparable) {
  const titleScore = jaccard(tokens(a.title), tokens(b.title));
  const fullScore = jaccard(
    tokens(`${a.title} ${a.description ?? ""}`),
    tokens(`${b.title} ${b.description ?? ""}`),
  );
  return Math.round((0.65 * titleScore + 0.35 * fullScore) * 100) / 100;
}

export const DUPLICATE_THRESHOLD = 0.3;

export interface DuplicateCandidate {
  type: "issue" | "draft";
  id: string;
  key?: string;
  title: string;
  score: number;
  source: "similarity" | "ai";
}

export function findDuplicates<T extends Comparable & { id: string; key?: string }>(
  target: Comparable,
  pool: T[],
  type: DuplicateCandidate["type"],
  limit = 3,
): DuplicateCandidate[] {
  return pool
    .map((p) => ({ p, score: similarity(target, p) }))
    .filter((x) => x.score >= DUPLICATE_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ p, score }) => ({ type, id: p.id, key: p.key, title: p.title, score, source: "similarity" as const }));
}
