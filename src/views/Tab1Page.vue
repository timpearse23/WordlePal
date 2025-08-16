<template>
  <ion-page class="wordle-page">
    <ion-header>
      <ion-toolbar>
        <ion-title>WordlePal</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true" class="content">
      <div class="board-wrapper">
        <div class="board">
          <div v-for="(row, rIndex) in board" :key="rIndex" class="board-row">
            <div
              v-for="(cell, cIndex) in row"
              :key="cIndex"
              class="board-cell"
              :class="cell.color"
              @click="onCellClick(rIndex, cIndex, $event)"
            >
              <input
                :id="inputId(rIndex, cIndex)"
                class="cell-input"
                type="text"
                inputmode="text"
                maxlength="1"
                autocomplete="off"
                autocapitalize="characters"
                :value="cell.char"
                @input="onInput(rIndex, cIndex, $event)"
                @mousedown.stop
                @keydown="onKeyDown(rIndex, cIndex, $event)"
              />
            </div>
          </div>
        </div>
      </div>

      <div class="mode-select">
        <select v-model="mode">
          <option value="fewest">Fewest Words</option>
          <option value="quickest">Quickest Solution</option>
        </select>
        <div class="remaining-inline">Remaining words: {{ remainingCount }}</div>
      </div>

      <!-- removed ranked guesses list per user request -->

      <div class="controls">
        <ion-button fill="clear" class="nav-btn" @click="prevWord">&lt;</ion-button>
        <ion-button class="play-btn" @click="play">Play</ion-button>
        <ion-button fill="clear" class="nav-btn" @click="nextWord">&gt;</ion-button>
        <ion-button fill="clear" class="reset-btn" @click="resetBoard">Reset</ion-button>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue';
import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButton } from '@ionic/vue';
import { playGame, rankGuessesByExpectedRemaining, findBestGuessRecursive } from '@/game/play';

type Cell = { char: string; color: 'white' | 'grey' | 'yellow' | 'green' };
const ROWS = 6;
const COLS = 5;

const board = reactive<Cell[][]>(
  Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => ({ char: '', color: 'white' } as Cell)))
);

function inputId(r: number, c: number) {
  return `input-${r}-${c}`;
}

function focusCell(r: number, c: number) {
  const el = document.getElementById(inputId(r, c)) as HTMLInputElement | null;
  el?.focus();
}

function nextPosition(r: number, c: number) {
  let nr = r;
  let nc = c + 1;
  if (nc >= COLS) {
    nc = 0;
    nr = nr + 1;
    if (nr >= ROWS) nr = 0;
  }
  return { nr, nc };
}

function prevPosition(r: number, c: number) {
  let nr = r;
  let nc = c - 1;
  if (nc < 0) {
    nc = COLS - 1;
    nr = nr - 1;
    if (nr < 0) nr = ROWS - 1;
  }
  return { nr, nc };
}

function onCellClick(r: number, c: number, e?: MouseEvent) {
  const cell = board[r][c];
  if (!cell.char) {
    focusCell(r, c);
    return;
  }
  toggleCellColor(r, c);
}

function toggleCellColor(r: number, c: number) {
  const cell = board[r][c];
  if (!cell.char) return;
  if (cell.color === 'grey') cell.color = 'yellow';
  else if (cell.color === 'yellow') cell.color = 'green';
  else cell.color = 'grey';
}

function onInput(r: number, c: number, e: Event) {
  const target = e.target as HTMLInputElement;
  let v = (target.value || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1);
  target.value = v;
  // overwrite existing letter and reset colour to white so user must tap to set colour
  board[r][c].char = v;
  board[r][c].color = v ? 'white' : 'white';
  if (v) {
    const { nr, nc } = nextPosition(r, c);
    setTimeout(() => focusCell(nr, nc), 0);
  }
}

function onKeyDown(r: number, c: number, e: KeyboardEvent) {
  const key = e.key;
  const el = document.getElementById(inputId(r, c)) as HTMLInputElement | null;

  // treat Delete (and legacy 'Del' / keyCode 46) as clear current cell
  if (key === 'Delete' || key === 'Del' || (e as any).keyCode === 46) {
    e.preventDefault();
    e.stopPropagation();
    if (el) el.value = '';
    board[r][c].char = '';
    board[r][c].color = 'white';
    return;
  }

  // Backspace: if current cell has value, clear it; otherwise move to previous and clear
  if (key === 'Backspace' || (e as any).keyCode === 8) {
    e.preventDefault();
    e.stopPropagation();
    if (el && el.value) {
      el.value = '';
      board[r][c].char = '';
      board[r][c].color = 'white';
      // keep focus on current cell for further editing
      if (el) el.focus();
      return;
    }
    // move to previous cell and clear it
    const { nr, nc } = prevPosition(r, c);
    setTimeout(() => {
      const prevEl = document.getElementById(inputId(nr, nc)) as HTMLInputElement | null;
      if (prevEl) {
        prevEl.focus();
        prevEl.value = '';
      }
      board[nr][nc].char = '';
      board[nr][nc].color = 'white';
    }, 0);
    return;
  }
}

// analysis state
const remainingCount = ref<number>(0);
const remainingWords = ref<string[]>([]);
const shuffledWords = ref<string[]>([]);
const suggestionList = ref<string[]>([]);
const suggestionIndex = ref<number>(0);
const suggestionRow = ref<number | null>(null);
const mode = ref<'fewest' | 'quickest'>('fewest');
const rankedGuesses = ref<Array<{ word: string; expectedRemaining: number }>>([]);

// cached first word (default RAISE)
const cachedFirstWord = ref<string>('RAISE');
onMounted(() => {
  try {
    const v = localStorage.getItem('wordlepal.firstWord');
    if (v && v.length === COLS) cachedFirstWord.value = v.toUpperCase();
    // place cached first word into first row on mount
    for (let c = 0; c < COLS; c++) {
      const ch = (cachedFirstWord.value[c] || '')?.toUpperCase();
      board[0][c].char = ch;
      board[0][c].color = ch ? 'white' : 'white';
      const el = document.getElementById(inputId(0, c)) as HTMLInputElement | null;
      if (el) el.value = ch;
    }
  } catch (e) {
    // ignore
  }
});

function shuffleArray<T>(arr: T[]) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function applySuggestionToRow(index: number) {
  if (suggestionRow.value === null) return;
  const sr = suggestionRow.value;
  const word = suggestionList.value[index];
  if (!word) return;
  for (let c = 0; c < COLS; c++) {
    const ch = word[c] ?? '';
    board[sr][c].char = ch;
    board[sr][c].color = 'white';
    const el = document.getElementById(inputId(sr, c)) as HTMLInputElement | null;
    if (el) el.value = ch;
  }
}

function resetBoard() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      board[r][c].char = '';
      board[r][c].color = 'white';
      const el = document.getElementById(inputId(r, c)) as HTMLInputElement | null;
      if (el) el.value = '';
    }
  }
  // place cached first word into first row
  for (let c = 0; c < COLS; c++) {
    const ch = (cachedFirstWord.value[c] || '')?.toUpperCase();
    board[0][c].char = ch;
    board[0][c].color = 'white';
    const el = document.getElementById(inputId(0, c)) as HTMLInputElement | null;
    if (el) el.value = ch;
  }
  remainingCount.value = 0;
  remainingWords.value = [];
  shuffledWords.value = [];
  suggestionList.value = [];
  suggestionIndex.value = 0;
  suggestionRow.value = null;
  setTimeout(() => focusCell(0, 0), 0);
}

function prevWord() {
  if (!suggestionList.value.length || suggestionRow.value === null) return;
  const len = suggestionList.value.length;
  // determine current displayed word from the board (more robust than relying solely on suggestionIndex)
  const sr = suggestionRow.value;
  const currentWord = suggestionList.value[suggestionIndex.value];
  const boardWord = board[sr].map(c => (c.char || '').toLowerCase()).join('');
  let curIndex = suggestionList.value.findIndex(w => w.toLowerCase() === boardWord) ;
  if (curIndex === -1) curIndex = suggestionIndex.value;
  const prevIndex = (curIndex - 1 + len) % len;
  suggestionIndex.value = prevIndex;
  applySuggestionToRow(suggestionIndex.value);
}
function nextWord() {
  if (!suggestionList.value.length || suggestionRow.value === null) return;
  const len = suggestionList.value.length;
  const sr = suggestionRow.value;
  const boardWord = board[sr].map(c => (c.char || '').toLowerCase()).join('');
  let curIndex = suggestionList.value.findIndex(w => w.toLowerCase() === boardWord);
  if (curIndex === -1) curIndex = suggestionIndex.value;
  const nextIndex = (curIndex + 1) % len;
  suggestionIndex.value = nextIndex;
  applySuggestionToRow(suggestionIndex.value);
}

async function play() {
  const hasPartial = board.some((row) => {
    const filled = row.filter((cell) => cell.char).length;
    return filled > 0 && filled < COLS;
  });
  const completeRows = board.filter((row) => row.every((cell) => cell.char));
  if (hasPartial || completeRows.length === 0) {
    window.alert('Please enter at least one complete word with colours');
    return;
  }
  const hasUncoloured = completeRows.some((row) => row.some((cell) => cell.color === 'white'));
  if (hasUncoloured) {
    window.alert('Click all letters to toggle colour');
    return;
  }

  // cache first completed row as first word
  try {
    const firstIdx = board.findIndex((row) => row.every((cell) => cell.char));
    if (firstIdx !== -1) {
      const w = board[firstIdx].map((c) => c.char || '').join('').slice(0, COLS).toUpperCase();
      if (w.length === COLS) {
        cachedFirstWord.value = w;
        try { localStorage.setItem('wordlepal.firstWord', w); } catch (_) {}
      }
    }
  } catch (_) {}

  const solvedRowIndex = board.findIndex((row) => row.every((cell) => cell.char && cell.color === 'green'));
  if (solvedRowIndex !== -1) {
    window.alert(`Congratulations! We solved it in ${solvedRowIndex + 1}!`);
    return;
  }

  const result = await playGame(board as any);
  // dedupe remaining words to avoid duplicates coming from the source
  const rawList = result.possibleWords || [];
  const deduped = Array.from(new Set(rawList));
  remainingWords.value = deduped;
  // prefer the deduplicated list length so UI matches the console output
  remainingCount.value = deduped.length;
  // show remaining words with metrics in console when user hits Play
  if (remainingWords.value.length > 0) {
    if (mode.value === 'fewest') {
      try {
        const rankedAll = await rankGuessesByExpectedRemaining(remainingWords.value, remainingWords.value);
        const out = rankedAll.map(r => ({ word: r.word, expectedRemaining: Number(r.expectedRemaining.toFixed(2)) }));
        console.log('Remaining words with expectedRemaining (fewest):', out);
      } catch (_) {
        console.log('Remaining words:', remainingWords.value);
      }
    } else {
      try {
        const res = await findBestGuessRecursive(remainingWords.value, remainingWords.value, { candidateLimit: 250, maxGuessesConsider: 50, timeBudgetMs: 5000 });
        const list = (res.best || []).map((b: any) => ({ word: b.word, expectedGuesses: Number((b.expectedSteps || b.expectedSteps === 0 ? b.expectedSteps : b.expectedSteps).toFixed(2)) }));
        console.log(`Remaining words with expectedGuesses (quickest) - timeMs:${res.timeMs} aborted:${res.aborted}`, list);
      } catch (e) {
        console.log('Remaining words:', remainingWords.value);
      }
    }
  } else {
    console.log('Remaining words: []');
  }

  if (remainingWords.value.length > 0) {
    try {
      if (mode.value === 'fewest') {
        const ranked = await rankGuessesByExpectedRemaining(remainingWords.value, remainingWords.value, 20);
        rankedGuesses.value = ranked.slice(0, 10).map(r => ({ word: r.word, expectedRemaining: r.expectedRemaining }));
      } else {
        rankedGuesses.value = [];
      }
    } catch (e) {
      // silently ignore ranking errors in production
      rankedGuesses.value = [];
    }
  } else {
    rankedGuesses.value = [];
  }

  if (remainingWords.value.length > 0) {
    // build suggestionList according to mode
    if (mode.value === 'fewest' && rankedGuesses.value.length) {
      suggestionList.value = rankedGuesses.value.map((r: { word: string; expectedRemaining: number }) => r.word);
    } else if (mode.value === 'quickest') {
      // If recursive solver produced an ordered list earlier (res), try to use it; otherwise fallback
      // fallback to remainingWords
      // note: we logged recursive res earlier but didn't store it; use rankedGuesses if available
      suggestionList.value = suggestionList.value.length ? suggestionList.value : remainingWords.value.slice();
    } else {
      suggestionList.value = remainingWords.value.slice();
    }
    suggestionIndex.value = 0;
    let sr = board.findIndex((row) => row.every((cell) => !cell.char));
    if (sr === -1) sr = 0;
    suggestionRow.value = sr;
    applySuggestionToRow(suggestionIndex.value);
  } else {
    shuffledWords.value = [];
    suggestionRow.value = null;
    suggestionIndex.value = 0;
    window.alert('No remaining words found');
  }
}
</script>

<style scoped>
.wordle-page { background: #ffffff; }
.content { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:16px; }
.board-wrapper { width:100%; max-width:420px; }
.board { display:grid; gap:8px; }
.board-row { display:grid; grid-template-columns:repeat(5,1fr); gap:8px; }
.board-cell { position:relative; width:100%; aspect-ratio:1/1; border:2px solid #e0e0e0; display:flex; align-items:center; justify-content:center; background:#fff; box-sizing:border-box; border-radius:6px; }
.board-cell.grey { background:#d3d3d3; }
.board-cell.yellow { background:#f6e27a; }
.board-cell.green { background:#6aaa64; color:#fff; }
/* Ensure input text is visible in dark mode */
.cell-input { width:70%; height:70%; text-align:center; border:none; outline:none; background:transparent; font-size:1.5rem; font-weight:700; text-transform:uppercase; caret-color:auto; appearance:none; -webkit-appearance:none; border-radius:4px; color:#000; }
/* Keep white text on green tiles for contrast */
.board-cell.green .cell-input { color: #fff; }
.controls { display:flex; gap:12px; margin-top:20px; align-items:center; }
.mode-select { margin:12px 0; display:flex; align-items:center; gap:8px; }
.remaining-inline { font-weight:600; }
</style>
