/**
 * Fuzzy duplicate detection for student profiles.
 *
 * Signals used:
 * 1. Normalized exact match (case, spaces, accents)
 * 2. Token overlap (shared name words)
 * 3. Prefix / nickname detection between tokens
 * 4. Shared last-name boost
 * 5. Placeholder-email detection (import_*@scgolf.placeholder)
 * 6. Matching real email across two profiles
 */

// ── helpers ──────────────────────────────────────────────────────────────────

/** Lowercase, collapse whitespace, strip accents */
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Split a name into unique tokens ≥ 2 chars */
function tokens(name: string): string[] {
  return normalize(name)
    .split(" ")
    .filter((t) => t.length >= 2);
}

/** Jaccard similarity of two token sets */
function jaccardSim(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  setA.forEach((t) => {
    if (setB.has(t)) inter++;
  });
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

/**
 * Check if one token is a prefix/nickname of the other.
 * Returns true if the shorter token (≥3 chars) is a prefix of the longer,
 * e.g. "jony" is prefix-like to "jonathan" → not exact prefix but close.
 * We use a looser check: first 3 chars match.
 */
function tokenPrefixMatch(a: string, b: string): boolean {
  if (a === b) return false; // exact match handled elsewhere
  const minLen = Math.min(a.length, b.length);
  if (minLen < 3) return false;
  // Check if shorter is a prefix of longer
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (longer.startsWith(shorter)) return true;
  // Check if first 3 chars match (covers nickname variants like jony/jonathan)
  if (shorter.slice(0, 3) === longer.slice(0, 3)) return true;
  return false;
}

/**
 * Check if any non-shared token in A has a prefix match with any non-shared token in B.
 * Returns the number of prefix-matched pairs found.
 */
function countPrefixMatches(aTokens: string[], bTokens: string[]): number {
  const shared = new Set(aTokens.filter((t) => bTokens.includes(t)));
  const aUnique = aTokens.filter((t) => !shared.has(t));
  const bUnique = bTokens.filter((t) => !shared.has(t));
  let count = 0;
  for (const at of aUnique) {
    for (const bt of bUnique) {
      if (tokenPrefixMatch(at, bt)) {
        count++;
        break; // one match per aToken
      }
    }
  }
  return count;
}

/**
 * Check if two names share a last name (last token).
 */
function sharedLastName(aTokens: string[], bTokens: string[]): boolean {
  if (aTokens.length === 0 || bTokens.length === 0) return false;
  return aTokens[aTokens.length - 1] === bTokens[bTokens.length - 1];
}

/** Is this an import placeholder email? */
export function isPlaceholderEmail(email: string): boolean {
  return /^import_\d+_\d+@scgolf\.placeholder$/i.test(email) ||
    /^split-.*@placeholder\.local$/i.test(email) ||
    /^no-email-.*@placeholder\.local$/i.test(email);
}

/** Is this profile a soft-deleted "merged" duplicate? */
export function isMergedProfile(profile: { email?: string | null; full_name?: string | null }): boolean {
  if (profile.email && /^merged\+.*@archived\.local$/i.test(profile.email)) return true;
  // Legacy: profiles merged before this signal existed are still tagged with "[MERGED]"
  if (profile.full_name && profile.full_name.startsWith("[MERGED]")) return true;
  return false;
}

// ── types ────────────────────────────────────────────────────────────────────

export interface StudentProfile {
  id: string;
  full_name: string | null;
  email: string;
  handicap?: number | null;
  created_at?: string | null;
  lessonCount?: number;
  packageCount?: number;
}

export interface DuplicateGroup {
  /** The student we recommend keeping (real account preferred) */
  primary: StudentProfile;
  /** The probable duplicate(s) */
  duplicates: StudentProfile[];
  /** Human-readable reasons the system flagged this */
  reasons: string[];
  /** 0-1 confidence score */
  confidence: number;
}

/** Match result when comparing an import row name against existing DB students */
export interface ImportDuplicateMatch {
  rowIndex: number;
  importedName: string;
  existingStudent: StudentProfile;
  reasons: string[];
  confidence: number;
}

// ── core comparison logic ───────────────────────────────────────────────────

function compareNames(
  aName: string,
  bName: string,
): { reasons: string[]; score: number } {
  const aNorm = normalize(aName);
  const bNorm = normalize(bName);
  const aTokens = tokens(aName);
  const bTokens = tokens(bName);
  const reasons: string[] = [];
  let score = 0;

  if (aNorm === bNorm) {
    reasons.push("Exact name match (case-insensitive)");
    return { reasons, score: 1 };
  }

  // Token overlap (Jaccard)
  const jSim = jaccardSim(aTokens, bTokens);
  if (jSim >= 0.5) {
    reasons.push(`Name overlap ${Math.round(jSim * 100)}%`);
    score = Math.max(score, jSim);
  }

  // Subset check
  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  if (aTokens.length > 0 && bTokens.length > 0) {
    if (aTokens.every((t) => bSet.has(t)) || bTokens.every((t) => aSet.has(t))) {
      reasons.push("One name is a subset of the other");
      score = Math.max(score, 0.85);
    }
  }

  // Prefix / nickname matching + shared last name
  const prefixMatches = countPrefixMatches(aTokens, bTokens);
  const hasSharedLast = sharedLastName(aTokens, bTokens);
  const sharedTokenCount = aTokens.filter((t) => bSet.has(t)).length;

  // Strong signal: shared last name + prefix match on first name
  if (hasSharedLast && prefixMatches > 0) {
    reasons.push("Shared last name + similar first name");
    score = Math.max(score, 0.75);
  } else if (hasSharedLast && sharedTokenCount > 0 && (aTokens.length > 1 || bTokens.length > 1)) {
    // Shared last name + at least one other shared token
    reasons.push("Shared last name with common tokens");
    score = Math.max(score, 0.65);
  } else if (prefixMatches > 0 && sharedTokenCount > 0) {
    // Some shared tokens + prefix match on others
    reasons.push("Partial name match with nickname similarity");
    score = Math.max(score, 0.6);
  }

  return { reasons, score };
}

// ── detection: existing students vs each other ──────────────────────────────

export function detectDuplicates(students: StudentProfile[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const consumed = new Set<string>();

  for (let i = 0; i < students.length; i++) {
    if (consumed.has(students[i].id)) continue;
    const a = students[i];
    const aName = a.full_name || "";
    if (!aName.trim()) continue;
    // Skip already-merged duplicates
    if (isMergedProfile(a)) continue;

    const matches: { student: StudentProfile; reasons: string[]; score: number }[] = [];

    for (let j = i + 1; j < students.length; j++) {
      if (consumed.has(students[j].id)) continue;
      const b = students[j];
      const bName = b.full_name || "";
      if (!bName.trim()) continue;
      if (isMergedProfile(b)) continue;

      const { reasons, score: nameScore } = compareNames(aName, bName);
      let score = nameScore;

      // Email match
      if (a.email === b.email && !isPlaceholderEmail(a.email)) {
        reasons.push("Same email address");
        score = Math.max(score, 0.95);
      }

      // Placeholder boost
      if (isPlaceholderEmail(a.email) || isPlaceholderEmail(b.email)) {
        if (reasons.length > 0) {
          reasons.push("One record uses an import placeholder email");
          score = Math.min(1, score + 0.05);
        }
      }

      if (score >= 0.45 && reasons.length > 0) {
        matches.push({ student: b, reasons, score: Math.min(score, 1) });
      }
    }

    if (matches.length > 0) {
      const allCandidates = [a, ...matches.map((m) => m.student)];
      const real = allCandidates.filter((s) => !isPlaceholderEmail(s.email));
      const primary = real.length > 0 ? real[0] : allCandidates[0];
      const duplicates = allCandidates.filter((s) => s.id !== primary.id);
      const allReasons = [...new Set(matches.flatMap((m) => m.reasons))];
      const confidence = Math.max(...matches.map((m) => m.score));
      groups.push({ primary, duplicates, reasons: allReasons, confidence });
      consumed.add(primary.id);
      duplicates.forEach((d) => consumed.add(d.id));
    }
  }

  return groups.sort((a, b) => b.confidence - a.confidence);
}

// ── detection: import rows vs existing DB students ──────────────────────────

export function detectImportDuplicates(
  importedNames: { rowIndex: number; clientName: string }[],
  existingStudents: StudentProfile[],
): ImportDuplicateMatch[] {
  const results: ImportDuplicateMatch[] = [];

  for (const { rowIndex, clientName } of importedNames) {
    const name = clientName.trim();
    if (!name) continue;

    let bestMatch: ImportDuplicateMatch | null = null;

    for (const student of existingStudents) {
      const sName = student.full_name || "";
      if (!sName.trim()) continue;
      if (isMergedProfile(student)) continue;

      const { reasons, score } = compareNames(name, sName);

      if (score >= 0.45 && reasons.length > 0) {
        if (!bestMatch || score > bestMatch.confidence) {
          bestMatch = {
            rowIndex,
            importedName: name,
            existingStudent: student,
            reasons,
            confidence: Math.min(score, 1),
          };
        }
      }
    }

    if (bestMatch) {
      results.push(bestMatch);
    }
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}
