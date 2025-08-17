<template>
  <ion-page class="wordle-page">
    <ion-header>
      <ion-toolbar>
        <ion-title>WordlePal</ion-title>
        <div class="header-controls" slot="end">
          <select v-model="mode" class="header-mode">
            <option value="fewest">Fewest Words</option>
            <option value="quickest">Quickest Solution</option>
          </select>
          <div class="remaining-inline header-remaining">Words: {{ remainingCount }}</div>
          <ion-button fill="clear" @click="showInfo"> 
            <ion-icon :icon="infoIcon" />
          </ion-button>
        </div>
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
              :class="[cell.color, (rIndex === focusedRow && cIndex === focusedCol) ? 'focused' : '']"
              @click="onCellClick(rIndex, cIndex, $event)"
            >
              <input
                :id="inputId(rIndex, cIndex)"
                class="cell-input"
                type="text"
                inputmode="none"
                readonly
                maxlength="1"
                autocomplete="off"
                autocapitalize="characters"
                :value="cell.char"
                tabindex="-1"
                @mousedown.stop
                @keydown="onKeyDown(rIndex, cIndex, $event)"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- mode/remaining moved to header -->

      <!-- removed ranked guesses list per user request -->

      <div class="controls">
        <ion-button fill="clear" class="nav-btn" @click="prevWord">&lt;</ion-button>
        <ion-button class="play-btn" @click="play">Play</ion-button>
        <ion-button fill="clear" class="reset-btn" @click="resetBoard">Reset</ion-button>
        <ion-button fill="clear" class="nav-btn" @click="nextWord">&gt;</ion-button>
      </div>

      <!-- Virtual on-screen keyboard -->
      <div class="keyboard compact" aria-hidden="false">
        <div class="k-row" v-for="(row, rIdx) in keyboardLayout" :key="rIdx" :data-cols="row.length">
          <button v-for="key in row" :key="key" class="k-key" :class="{
            'arrow-key': key === '←' || key === '→',
            'reset-key': key === 'RESET',
            'del-key': key === 'DEL',
            'enter-key': key === 'ENTER'
          }" @click="pressVirtualKey(key)">{{ key }}</button>
        </div>
      </div>

    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue';
import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonButtons, IonIcon } from '@ionic/vue';
import { playGame, rankGuessesByExpectedRemaining, findBestGuessRecursive } from '@/game/play';
import { informationCircleOutline } from 'ionicons/icons';

const infoIcon = informationCircleOutline;
function showInfo() {
  window.alert(
    `WorldPal v1.01\n\nWelcome to WordlePal, please use me whilst playing wordle.  Enter your previous guesses and tap the letters to toggle through the colours.  Then hit play to get a list of suggested next guesses!`
  );
}

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

const focusedRow = ref<number>(0);
const focusedCol = ref<number>(0);

// QWERTY layout (compact)
const keyboardLayout = [
  ['←','Q','W','E','R','T','Y','U','I','O','P','→'],
  ['A','S','D','F','G','H','J','K','L','RESET'],
  ['ENTER','Z','X','C','V','B','N','M','DEL']
];

function setFocusedCell(r: number, c: number) {
  focusedRow.value = Math.max(0, Math.min(ROWS - 1, r));
  focusedCol.value = Math.max(0, Math.min(COLS - 1, c));
}

function onCellClick(r: number, c: number, e?: MouseEvent) {
  const cell = board[r][c];
  // always set the focused cell and focus the DOM input so keyboard/Delete target the clicked cell
  setFocusedCell(r, c);
  setTimeout(() => focusCell(r, c), 0);
  if (!cell.char) {
    // nothing else to do when empty — ready for virtual keyboard input
    return;
  }
  // if there is a letter already, toggle colour as before
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
  // overwrite existing letter and set colour to grey so user can tap to cycle to yellow/green
  board[r][c].char = v;
  board[r][c].color = v ? 'grey' : 'white';
  if (v) {
    const { nr, nc } = nextPosition(r, c);
    setTimeout(() => focusCell(nr, nc), 0);
  }
}

function onKeyDown(r: number, c: number, e: KeyboardEvent) {
  const key = e.key;
  const el = document.getElementById(inputId(r, c)) as HTMLInputElement | null;

  // Enter / Return should trigger Play (useful for mobile keyboards)
  if (key === 'Enter' || (e as any).keyCode === 13) {
    e.preventDefault();
    e.stopPropagation();
    // blur the focused input to dismiss the on-screen keyboard
    if (el) el.blur();
    // call play()
    try { play(); } catch (_) {}
    return;
  }

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
      board[0][c].color = ch ? 'grey' : 'white';
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
    if (!ch) {
      board[sr][c].color = 'white';
      const el = document.getElementById(inputId(sr, c)) as HTMLInputElement | null;
      if (el) el.value = ch;
      continue;
    }
    // If any earlier row has the same letter in this column marked green, preserve green
    let foundGreenAbove = false;
    for (let r = 0; r < sr; r++) {
      const above = board[r][c];
      if ((above.char || '').toUpperCase() === ch.toUpperCase() && above.color === 'green') {
        foundGreenAbove = true;
        break;
      }
    }
    board[sr][c].color = foundGreenAbove ? 'green' : 'grey';
    const el = document.getElementById(inputId(sr, c)) as HTMLInputElement | null;
    if (el) el.value = ch;
  }
}

function applyWordToRow(word: string) {
  if (suggestionRow.value === null) return;
  const sr = suggestionRow.value;
  if (!word) return;
  for (let c = 0; c < COLS; c++) {
    const ch = word[c] ?? '';
    board[sr][c].char = ch;
    // preserve greens from earlier rows
    let foundGreenAbove = false;
    for (let r = 0; r < sr; r++) {
      const above = board[r][c];
      if ((above.char || '').toUpperCase() === ch.toUpperCase() && above.color === 'green') {
        foundGreenAbove = true;
        break;
      }
    }
    board[sr][c].color = ch ? (foundGreenAbove ? 'green' : 'grey') : 'white';
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
    board[0][c].color = ch ? 'grey' : 'white';
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
  if (suggestionRow.value === null) return;
  const navList = suggestionList.value;
  const len = navList.length;
  if (!len) return;
  const sr = suggestionRow.value;
  const boardWord = board[sr].map(c => (c.char || '').toLowerCase()).join('');
  let curIndex = navList.findIndex(w => w.toLowerCase() === boardWord);
  if (curIndex === -1) curIndex = (suggestionIndex.value >= 0 && suggestionIndex.value < len) ? suggestionIndex.value : 0;
  const prevIndex = (curIndex - 1 + len) % len;
  suggestionIndex.value = prevIndex;
  applyWordToRow(navList[prevIndex]);
}

function nextWord() {
  if (suggestionRow.value === null) return;
  const navList = suggestionList.value;
  const len = navList.length;
  if (!len) return;
  const sr = suggestionRow.value;
  const boardWord = board[sr].map(c => (c.char || '').toLowerCase()).join('');
  let curIndex = navList.findIndex(w => w.toLowerCase() === boardWord);
  if (curIndex === -1) curIndex = (suggestionIndex.value >= 0 && suggestionIndex.value < len) ? suggestionIndex.value : 0;
  const nextIndex = (curIndex + 1) % len;
  suggestionIndex.value = nextIndex;
  applyWordToRow(navList[nextIndex]);
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
  // build a set of words the user already entered (complete rows) so we can exclude them
  const entered = board
    .filter((row) => row.every((cell) => cell.char))
    .map((row) => row.map((c) => (c.char || '').toLowerCase()).join(''));
  const enteredSet = new Set(entered.filter(Boolean));
  // exclude previously-entered words from remaining candidates
  const filtered = deduped.filter((w) => !enteredSet.has((w || '').toLowerCase()));
  remainingWords.value = filtered;
  // prefer the deduplicated & filtered list length so UI matches the console output
  remainingCount.value = filtered.length;

  // Simplified ranking: produce a full ordered list of remaining words according to mode
  let sortedList: string[] = remainingWords.value.slice();
  if (remainingWords.value.length > 0) {
    if (mode.value === 'fewest') {
      try {
        const rankedAll = await rankGuessesByExpectedRemaining(remainingWords.value, remainingWords.value);
        // rankedAll is ordered by expectedRemaining ascending
        sortedList = rankedAll.map((r: any) => r.word);
        console.log('Remaining words ordered by expectedRemaining (fewest):', rankedAll.map((r: any) => ({ word: r.word, expectedRemaining: Number(r.expectedRemaining.toFixed(2)) })));
      } catch (e) {
        console.log('Remaining words (fallback order):', remainingWords.value);
        sortedList = remainingWords.value.slice();
      }
    } else {
      try {
        const res = await findBestGuessRecursive(remainingWords.value, remainingWords.value, { candidateLimit: 250, maxGuessesConsider: 50, timeBudgetMs: 5000 });
        if (res && Array.isArray(res.best) && res.best.length) {
          sortedList = res.best.map((b: any) => b.word);
          console.log(`Remaining words ordered by expectedGuesses (quickest) - timeMs:${res.timeMs} aborted:${res.aborted}`, res.best.map((b: any) => ({ word: b.word, expected: b.expectedSteps })));
        } else {
          sortedList = remainingWords.value.slice();
          console.log('Remaining words (quickest) fallback):', remainingWords.value);
        }
      } catch (e) {
        console.log('Remaining words (quickest fallback):', remainingWords.value);
        sortedList = remainingWords.value.slice();
      }
    }
  }

  // Now expose the full sorted list as suggestionList and make nav simple circular traversal
  suggestionList.value = sortedList.slice();
  suggestionIndex.value = 0;
  if (suggestionList.value.length > 0) {
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

// add virtual keyboard handler
function pressVirtualKey(key: string) {
  // navigation arrows
  if (key === '←' || key === '→') {
    if (key === '←') prevWord(); else nextWord();
    return;
  }
  if (key === 'DEL') {
    const r = focusedRow.value;
    const c = focusedCol.value;
    if (board[r][c].char) {
      board[r][c].char = '';
      board[r][c].color = 'white';
      return;
    }
    const { nr, nc } = prevPosition(r, c);
    setFocusedCell(nr, nc);
    board[nr][nc].char = '';
    board[nr][nc].color = 'white';
    return;
  }
  if (key === 'RESET') {
    resetBoard();
    return;
  }
  if (key === 'ENTER') {
    try { play(); } catch (_) {}
    return;
  }
  const r = focusedRow.value;
  const c = focusedCol.value;
  if (r == null || c == null) return;
  const letter = (key || '').toUpperCase().slice(0,1);
  if (!/[A-Z]/.test(letter)) return;
  board[r][c].char = letter;
  board[r][c].color = 'grey';
  const { nr, nc } = nextPosition(r, c);
  setFocusedCell(nr, nc);
}
</script>

<style scoped>
.wordle-page { background: #ffffff; }
/* Center content within the viewport (accounts for header) */
.content { display:flex; flex-direction:column; align-items:center; justify-content:space-between; padding:16px 16px 160px 16px; height: calc(100vh - 56px); box-sizing:border-box; overflow: hidden; }
/* Make the board wrapper fill available space so vertical centering works reliably */
.board-wrapper { width:100%; max-width:480px; display:flex; align-items:center; justify-content:center; height:100%; flex:1 1 auto; overflow: hidden; padding: 0 8px; }
/* Center the grid and its items */
.board { display:grid; gap:8px; justify-items:center; justify-content:center; align-items:center; width:100%; max-width:360px; margin:0 auto; }
.board-row { display:grid; grid-template-columns:repeat(5,1fr); gap:8px; width:100%; max-width:360px; margin:0 auto; }
.board-cell { position:relative; width:100%; aspect-ratio:1/1; border:2px solid #e0e0e0; display:flex; align-items:center; justify-content:center; background:#fff; box-sizing:border-box; border-radius:6px; }
.board-cell.grey { background:#bdbdbd; }
.board-cell.yellow { background:#f6e27a; }
.board-cell.green { background:#6aaa64; color:#fff; }
/* Ensure input text is visible in dark mode and slightly larger for readability */
.cell-input { width:70%; height:70%; text-align:center; border:none; outline:none; background:transparent; font-size:1.9rem; font-weight:700; text-transform:uppercase; caret-color:auto; appearance:none; -webkit-appearance:none; border-radius:4px; color:#000; }
/* Keep white text on green tiles for contrast */
.board-cell.green .cell-input { color: #fff; }
.controls { display:flex; justify-content:space-between; gap:12px; margin-top:20px; align-items:center; width:100%; max-width:360px; margin:0 auto; }
.mode-select { margin:12px 0; display:flex; align-items:center; gap:8px; }
.remaining-inline { font-weight:600; }
.board-cell.focused { outline: 3px solid #2196f3; }
/* Fixed keyboard at bottom to avoid any scrolling */
.keyboard { position: fixed; left:0; right:0; bottom:0; margin:0 auto; width:100%; max-width:480px; padding:12px 36px; box-sizing:border-box; background: #ffffff; box-shadow: 0 -4px 12px rgba(0,0,0,0.06); display:flex; flex-direction:column; gap:8px; z-index:1000; align-items:center; }
.keyboard.compact { position: fixed; left:0; right:0; bottom:0; margin:0 auto; width:100%; max-width:360px; padding:8px 12px; box-sizing:border-box; background: #ffffff; box-shadow: 0 -4px 12px rgba(0,0,0,0.06); display:flex; flex-direction:column; gap:6px; z-index:1000; }
.k-row { display:flex; gap:6px; justify-content:center; flex-wrap:wrap; }
.k-key { padding:8px 6px; font-size:0.95rem; min-width:22px; max-width:60px; border-radius:6px; box-sizing:border-box; }
.k-row { flex-wrap:nowrap; }

/* size keys so each row fills the keyboard width (for our three row lengths) */
.k-row[data-cols="12"] .k-key { flex: 0 0 calc((100% - 11*6px)/12); }
.k-row[data-cols="10"] .k-key { flex: 0 0 calc((100% - 9*6px)/10); }
.k-row[data-cols="9"]  .k-key { flex: 0 0 calc((100% - 8*6px)/9); }

.k-key.arrow-key { background:#2196f3; color:#fff; }
.k-key.reset-key { background:#f6e27a; color:#000; }
.k-key.del-key { background:#f05454; color:#fff; }
.k-key.enter-key { background:#6aaa64; color:#fff; }
.k-key { border:none; background:#efefef; font-weight:700; text-transform:uppercase; }
/* keep key labels on a single horizontal line and center them */
.k-key { white-space: nowrap; writing-mode: horizontal-tb; text-orientation: mixed; display:flex; align-items:center; justify-content:center; }
/* ensure special action keys have a slightly larger minimum width so labels don't wrap vertically */
.k-key.reset-key, .k-key.del-key, .k-key.enter-key { min-width:40px; padding:8px 10px; }
/* ensure keyboard buttons are large and tappable on mobile */
.k-key { box-shadow: none; }
/* tighten spacing on narrow screens so the keyboard wraps and fits */
@media (max-width: 420px) {
  .keyboard.compact { padding:6px 8px; }
  .k-key { padding:6px 8px; font-size:0.85rem; min-width:26px; max-width:40px; }
}
@media (max-width: 360px) {
  .k-key { padding:5px 6px; font-size:0.78rem; min-width:22px; max-width:36px; }
  .cell-input { font-size:1.6rem; }
}
.header-controls { display:flex; align-items:center; gap:8px; }
.header-mode { font-size:0.9rem; padding:4px 6px; }
.header-remaining { font-weight:600; margin-left:6px; }
</style>
