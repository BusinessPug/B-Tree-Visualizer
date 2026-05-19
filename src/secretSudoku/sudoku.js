export const SIZE_PRESETS = [
    { size: 4, boxRows: 2, boxCols: 2 },
    { size: 6, boxRows: 2, boxCols: 3 },
    { size: 8, boxRows: 2, boxCols: 4 },
    { size: 9, boxRows: 3, boxCols: 3 },
    { size: 10, boxRows: 2, boxCols: 5 },
    { size: 12, boxRows: 3, boxCols: 4 },
    { size: 15, boxRows: 3, boxCols: 5 },
    { size: 16, boxRows: 4, boxCols: 4 },
    { size: 20, boxRows: 4, boxCols: 5 },
];

export function getPreset(size) {
    return SIZE_PRESETS.find((p) => p.size === size) || SIZE_PRESETS[3];
}

export const DIFFICULTY_FRACTION = {
    easy: 0.4,
    medium: 0.55,
    hard: 0.68,
};

function emptyGrid(n) {
    return Array.from({ length: n }, () => new Array(n).fill(0));
}

function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function unUsedInBox(grid, rowStart, colStart, num, boxRows, boxCols) {
    for (let i = 0; i < boxRows; i++) {
        for (let j = 0; j < boxCols; j++) {
            if (grid[rowStart + i][colStart + j] === num) return false;
        }
    }
    return true;
}

function unUsedInRow(grid, i, num, n) {
    for (let j = 0; j < n; j++) if (grid[i][j] === num) return false;
    return true;
}

function unUsedInCol(grid, j, num, n) {
    for (let i = 0; i < n; i++) if (grid[i][j] === num) return false;
    return true;
}

function checkIfSafe(grid, i, j, num, n, boxRows, boxCols) {
    return (
        unUsedInRow(grid, i, num, n) &&
        unUsedInCol(grid, j, num, n) &&
        unUsedInBox(
            grid,
            i - (i % boxRows),
            j - (j % boxCols),
            num,
            boxRows,
            boxCols
        )
    );
}

function fillBox(grid, row, col, boxRows, boxCols, n) {
    const nums = shuffled(Array.from({ length: n }, (_, i) => i + 1));
    let k = 0;
    for (let i = 0; i < boxRows; i++) {
        for (let j = 0; j < boxCols; j++) {
            grid[row + i][col + j] = nums[k++];
        }
    }
}

function fillDiagonal(grid, n, boxRows, boxCols) {
    if (boxRows === boxCols) {
        for (let i = 0; i < n; i += boxRows) {
            fillBox(grid, i, i, boxRows, boxCols, n);
        }
    } else {
        fillBox(grid, 0, 0, boxRows, boxCols, n);
    }
}

function fillRemaining(grid, i, j, n, boxRows, boxCols) {
    if (j >= n) {
        i += 1;
        j = 0;
    }
    if (i >= n) return true;
    if (grid[i][j] !== 0)
        return fillRemaining(grid, i, j + 1, n, boxRows, boxCols);

    const nums = shuffled(Array.from({ length: n }, (_, k) => k + 1));
    for (const num of nums) {
        if (checkIfSafe(grid, i, j, num, n, boxRows, boxCols)) {
            grid[i][j] = num;
            if (fillRemaining(grid, i, j + 1, n, boxRows, boxCols)) return true;
            grid[i][j] = 0;
        }
    }
    return false;
}

function removeKDigits(grid, k, n) {
    let attempts = k;
    let safety = k * 10;
    while (attempts > 0 && safety-- > 0) {
        const cellId = Math.floor(Math.random() * n * n);
        const i = Math.floor(cellId / n);
        const j = cellId % n;
        if (grid[i][j] !== 0) {
            grid[i][j] = 0;
            attempts--;
        }
    }
}

export function generateSolved(size) {
    const { boxRows, boxCols } = getPreset(size);
    const grid = emptyGrid(size);
    fillDiagonal(grid, size, boxRows, boxCols);
    fillRemaining(grid, 0, 0, size, boxRows, boxCols);
    return grid;
}

export function generatePuzzle(size, difficulty) {
    const solution = generateSolved(size);
    const puzzle = solution.map((row) => row.slice());
    const fraction =
        DIFFICULTY_FRACTION[difficulty] ?? DIFFICULTY_FRACTION.medium;
    const blanks = Math.floor(size * size * fraction);
    removeKDigits(puzzle, blanks, size);
    return { puzzle, solution };
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function getSymbols(size, countFromZero) {
    const symbols = [];
    if (countFromZero) {
        for (let i = 0; i < size; i++) {
            symbols.push(i < 10 ? String(i) : ALPHABET[i - 10]);
        }
    } else {
        for (let i = 1; i <= size; i++) {
            symbols.push(i < 10 ? String(i) : ALPHABET[i - 10]);
        }
    }
    return symbols;
}

export function valueToSymbol(value, size, countFromZero) {
    if (value === 0) return "";
    const symbols = getSymbols(size, countFromZero);
    return symbols[value - 1];
}

export function symbolToValue(ch, size, countFromZero) {
    if (!ch) return 0;
    const symbols = getSymbols(size, countFromZero);
    const idx = symbols.indexOf(ch.toUpperCase());
    return idx === -1 ? 0 : idx + 1;
}
