/**
 * playGame
 * Evaluates the current board and returns candidate solution words from the
 * words list (public/words5.json).
 *
 * Rules implemented:
 * - 'green' at position means solution must have that letter at that position
 * - 'yellow' at position means solution must contain that letter but NOT at that position
 * - 'grey' means the letter is NOT present in the solution unless the same row
 *   contains green/yellow instances of that letter, in which case the grey
 *   indicates the solution has exactly the number of green/yellow instances
 *   of that letter in that row (standard Wordle repeat-letter handling).
 */

export type Cell = { char: string; color: string };

export type GameResult = {
  possibleWords: string[];
  count: number;
  message?: string;
};

let wordsCache: string[] | null = null;

async function loadWords(): Promise<string[]> {
  if (wordsCache) return wordsCache;
  try {
    const res = await fetch('/words5.json');
    if (!res.ok) throw new Error('Failed to fetch words list');
    const list = await res.json();
    wordsCache = (list as string[]).map(w => w.toLowerCase());
    return wordsCache;
  } catch (e) {
    console.error('Could not load words5.json', e);
    return [];
  }
}

function countLetters(word: string) {
  const map = new Map<string, number>();
  for (const ch of word) map.set(ch, (map.get(ch) || 0) + 1);
  return map;
}

export async function playGame(board: Cell[][]): Promise<GameResult> {
  const words = await loadWords();
  if (words.length === 0) return { possibleWords: [], count: 0, message: 'no words loaded' };

  // consider only rows with at least one letter
  const rows = board.map(row => row.map(cell => ({ char: (cell.char || '').toLowerCase(), color: cell.color })) );
  const effectiveRows = rows.filter(r => r.some(c => c.char && c.char.match(/[a-z]/)));

  // global constraints
  const globalMin = new Map<string, number>();
  const globalMax = new Map<string, number>(); // Infinity represented by undefined
  const greens: (string | null)[] = [null, null, null, null, null];
  const bannedAtPos: Set<string>[] = Array.from({ length: 5 }, () => new Set<string>());

  for (const row of effectiveRows) {
    // compute counts per letter in this row
    const totalCount = new Map<string, number>();
    const matchedCount = new Map<string, number>(); // green+yellow

    for (let i = 0; i < 5; i++) {
      const ch = row[i].char;
      if (!ch) continue;
      totalCount.set(ch, (totalCount.get(ch) || 0) + 1);
      if (row[i].color === 'green' || row[i].color === 'yellow') {
        matchedCount.set(ch, (matchedCount.get(ch) || 0) + 1);
      }
    }

    // per-row constraints
    for (const [ch, tot] of totalCount.entries()) {
      const matched = matchedCount.get(ch) || 0;
      // per-row min = matched (green+yellow)
      const perRowMin = matched;
      // per-row max = if tot > matched (some greys) then matched else Infinity
      const perRowMax = tot > matched ? matched : Infinity;

      const prevMin = globalMin.get(ch) || 0;
      globalMin.set(ch, Math.max(prevMin, perRowMin));

      const prevMax = globalMax.has(ch) ? globalMax.get(ch)! : Infinity;
      globalMax.set(ch, Math.min(prevMax, perRowMax));
    }

    // positions: handle greens and yellows, greys will be handled by counts
    for (let i = 0; i < 5; i++) {
      const { char: ch, color } = row[i];
      if (!ch) continue;
      if (color === 'green') {
        greens[i] = ch;
      } else if (color === 'yellow') {
        bannedAtPos[i].add(ch);
      } else if (color === 'grey') {
        // if there are zero matched instances in this row for ch, then this grey means 'no such letter at all'
        const matched = matchedCount.get(ch) || 0;
        if (matched === 0) {
          // absolute ban: max = 0
          const prevMax = globalMax.has(ch) ? globalMax.get(ch)! : Infinity;
          globalMax.set(ch, Math.min(prevMax, 0));
        } else {
          // otherwise grey implies this position is not that letter
          bannedAtPos[i].add(ch);
        }
      }
    }
  }

  // Now filter candidate words
  const candidates: string[] = [];
  wordLoop: for (const w of words) {
    if (w.length !== 5) continue;
    const word = w.toLowerCase();
    // green positions
    for (let i = 0; i < 5; i++) {
      const g = greens[i];
      if (g && word[i] !== g) continue wordLoop;
      if (bannedAtPos[i].has(word[i])) continue wordLoop; // letter at pos forbidden
    }

    // letter counts
    const wc = countLetters(word);
    // enforce globalMin
    for (const [ch, minV] of globalMin.entries()) {
      const have = wc.get(ch) || 0;
      if (have < minV) continue wordLoop;
    }
    // enforce globalMax
    for (const [ch, maxV] of globalMax.entries()) {
      if (!isFinite(maxV)) continue;
      const have = wc.get(ch) || 0;
      if (have > maxV) continue wordLoop;
    }

    // ensure yellows: for any yellow in any row, the word must contain that letter and not at that pos
    for (const row of effectiveRows) {
      for (let i = 0; i < 5; i++) {
        const { char: ch, color } = row[i];
        if (!ch) continue;
        if (color === 'yellow') {
          if (word[i] === ch) continue wordLoop;
          if ((wc.get(ch) || 0) < 1) continue wordLoop;
        }
        if (color === 'grey') {
          // if per-row matchedCount was 0, we already enforced max=0; otherwise ensure this position isn't that letter
          // (handled by bannedAtPos earlier)
        }
      }
    }

    candidates.push(word);
  }

  return { possibleWords: candidates.slice(0, 1000), count: candidates.length };
}

/**
 * Compute Wordle-style feedback pattern for a guess against a solution.
 * Pattern is a 5-character string using digits: '2' = green, '1' = yellow, '0' = grey.
 */
export function getFeedbackPattern(guess: string, solution: string): string {
  const g = guess.toLowerCase();
  const s = solution.toLowerCase();
  const pattern = Array(5).fill('0');

  // counts of letters in solution that are not matched by green
  const solCounts = new Map<string, number>();
  for (let i = 0; i < 5; i++) {
    const ch = s[i];
    solCounts.set(ch, (solCounts.get(ch) || 0) + 1);
  }

  // first pass: greens
  for (let i = 0; i < 5; i++) {
    if (g[i] === s[i]) {
      pattern[i] = '2';
      solCounts.set(g[i], (solCounts.get(g[i]) || 1) - 1);
    }
  }

  // second pass: yellows (accounting for remaining counts)
  for (let i = 0; i < 5; i++) {
    if (pattern[i] === '2') continue;
    const ch = g[i];
    const remaining = solCounts.get(ch) || 0;
    if (remaining > 0) {
      pattern[i] = '1';
      solCounts.set(ch, remaining - 1);
    } else {
      pattern[i] = '0';
    }
  }

  return pattern.join('');
}

/**
 * Given a set of candidate possible solutions, rank a pool of guesses by their expected
 * number of remaining possibilities after playing that guess. Expected value is computed
 * as average remaining words assuming the true solution is uniformly random from candidates.
 *
 * Returns an array sorted ascending by expectedRemaining. Optional limit to cap results.
 */
export async function rankGuessesByExpectedRemaining(
  candidates: string[],
  guesses?: string[],
  limit?: number
) {
  const S = candidates.length;
  const guessPool = (guesses && guesses.length) ? guesses : candidates;
  const results: { word: string; expectedRemaining: number; partitions: number }[] = [];

  for (const guess of guessPool) {
    // partition sizes keyed by feedback pattern
    const parts = new Map<string, number>();
    for (const sol of candidates) {
      const p = getFeedbackPattern(guess, sol);
      parts.set(p, (parts.get(p) || 0) + 1);
    }

    // expected remaining = (1/S) * sum_{parts} (size^2)
    let sumSq = 0;
    for (const sz of parts.values()) sumSq += sz * sz;
    const expectedRemaining = S > 0 ? sumSq / S : 0;

    results.push({ word: guess, expectedRemaining, partitions: parts.size });
  }

  results.sort((a, b) => {
    if (a.expectedRemaining !== b.expectedRemaining) return a.expectedRemaining - b.expectedRemaining;
    return a.word.localeCompare(b.word);
  });

  if (typeof limit === 'number' && limit > 0) return results.slice(0, limit);
  return results;
}

/**
 * Recursive solver to compute expected steps (1-based guesses) to solve the remaining
 * candidate set. This function is expensive; defaults are chosen to bound work.
 *
 * Options:
 * - candidateLimit: maximum number of candidate solutions to consider (default 250)
 * - maxGuessesConsider: maximum guesses to try at each node (default 50)
 * - timeBudgetMs: maximum run time in milliseconds (default 10000)
 */
export async function findBestGuessRecursive(
  allCandidates: string[],
  allGuesses?: string[],
  options?: { candidateLimit?: number; maxGuessesConsider?: number; timeBudgetMs?: number }
) {
  const candidateLimit = options?.candidateLimit ?? 250;
  const maxGuessesConsider = options?.maxGuessesConsider ?? 50;
  const timeBudgetMs = options?.timeBudgetMs ?? 10000;

  const start = Date.now();
  const deadline = start + timeBudgetMs;

  // work on a capped copy of candidates
  let candidates = allCandidates.slice();
  if (candidates.length > candidateLimit) candidates = candidates.slice(0, candidateLimit);

  // guesses pool (if provided) else use candidates
  const guessesPool = (allGuesses && allGuesses.length) ? allGuesses.slice() : candidates.slice();

  const memo = new Map<string, number>();
  let aborted = false;

  function keyForSet(arr: string[]) {
    return arr.length === 0 ? '' : arr.slice().sort().join(',');
  }

  async function expectedSteps(setArr: string[]): Promise<number> {
    if (Date.now() > deadline) {
      aborted = true;
      // heuristic fallback: 1 + log2(n)
      return 1 + Math.log2(Math.max(1, setArr.length));
    }
    if (setArr.length <= 1) return 1;
    const key = keyForSet(setArr);
    const m = memo.get(key);
    if (typeof m === 'number') return m;

    // choose guesses to consider at this node
    let pool = guessesPool;
    if (pool.length > maxGuessesConsider) {
      // pick top candidates from ranking heuristic
      const ranked = await rankGuessesByExpectedRemaining(setArr, pool, maxGuessesConsider);
      pool = ranked.map(r => r.word);
    }

    let bestVal = Infinity;

    for (const g of pool) {
      if (Date.now() > deadline) { aborted = true; break; }
      // partition setArr by feedback
      const parts = new Map<string, string[]>();
      for (const sol of setArr) {
        const p = getFeedbackPattern(g, sol);
        const a = parts.get(p) || [];
        a.push(sol);
        parts.set(p, a);
      }

      let sum = 0;
      for (const part of parts.values()) {
        const e = await expectedSteps(part);
        sum += (part.length / setArr.length) * e;
        if (aborted) break;
      }

      const val = 1 + sum;
      if (val < bestVal) bestVal = val;
      // small shortcut
      if (bestVal <= 1.01) break;
    }

    memo.set(key, bestVal);
    return bestVal;
  }

  // build initial pool for top-level evaluation
  let initialPool = guessesPool;
  if (initialPool.length > maxGuessesConsider) {
    const ranked = await rankGuessesByExpectedRemaining(candidates, initialPool, maxGuessesConsider);
    initialPool = ranked.map(r => r.word);
  }

  const results: { word: string; expectedSteps: number }[] = [];
  for (const g of initialPool) {
    if (Date.now() > deadline) { aborted = true; break; }
    const parts = new Map<string, string[]>();
    for (const sol of candidates) {
      const p = getFeedbackPattern(g, sol);
      const a = parts.get(p) || [];
      a.push(sol);
      parts.set(p, a);
    }

    let sum = 0;
    for (const part of parts.values()) {
      const e = await expectedSteps(part);
      sum += (part.length / candidates.length) * e;
      if (aborted) break;
    }

    const expected = 1 + sum;
    results.push({ word: g, expectedSteps: expected });
  }

  results.sort((a, b) => a.expectedSteps - b.expectedSteps || a.word.localeCompare(b.word));

  return { best: results, timeMs: Date.now() - start, aborted };
}

// end of file additions
