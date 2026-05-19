import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
    SIZE_PRESETS,
    getPreset,
    generatePuzzle,
    getSymbols,
    valueToSymbol,
    symbolToValue,
} from "./sudoku";

const DIFFICULTIES = ["easy", "medium", "hard"];

const STYLES = `
.sudoku-easter-egg {
    --se-bg: #1c1f26;
    --se-panel: #262a33;
    --se-cell-bg: #f7f6f1;
    --se-cell-given: #1c1f26;
    --se-cell-user: #2a6df4;
    --se-cell-wrong: #d23a3a;
    --se-cell-selected: #fff3a8;
    --se-border-thick: #0e1014;
    --se-accent: #2a6df4;

    position: fixed;
    inset: 0;
    overflow: auto;
    background: var(--se-bg);
    color: #eaeaea;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    z-index: 9999;
}
.sudoku-easter-egg *, .sudoku-easter-egg *::before, .sudoku-easter-egg *::after {
    box-sizing: border-box;
}
.sudoku-easter-egg .se-inner {
    max-width: min(95vw, 760px);
    margin: 0 auto;
    padding: 16px;
    outline: none;
}
.sudoku-easter-egg h1 {
    margin: 4px 0 16px;
    font-size: 1.8rem;
    letter-spacing: 0.5px;
}
.sudoku-easter-egg .se-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    background: var(--se-panel);
    padding: 12px;
    border-radius: 8px;
    margin-bottom: 16px;
}
.sudoku-easter-egg .se-controls label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.95rem;
}
.sudoku-easter-egg select,
.sudoku-easter-egg button {
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid #3a3f4b;
    background: #1c1f26;
    color: #eaeaea;
    font: inherit;
    font-size: 0.95rem;
    cursor: pointer;
}
.sudoku-easter-egg button:hover:not(:disabled) {
    background: var(--se-accent);
    border-color: var(--se-accent);
}
.sudoku-easter-egg button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}
.sudoku-easter-egg .se-toggle input {
    transform: scale(1.2);
    margin-right: 4px;
}
.sudoku-easter-egg .se-banner {
    padding: 10px;
    margin-bottom: 12px;
    border-radius: 6px;
    text-align: center;
    font-weight: 600;
    background: #1f6b3a;
    color: #d6ffe0;
}
.sudoku-easter-egg .se-board {
    display: grid;
    width: 100%;
    aspect-ratio: 1 / 1;
    background: var(--se-border-thick);
    border: 3px solid var(--se-border-thick);
    border-radius: 6px;
    user-select: none;
}
.sudoku-easter-egg .se-cell {
    background: var(--se-cell-bg);
    color: var(--se-cell-user);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 500;
    font-size: clamp(0.7rem, 3.2vw, 1.4rem);
    border-right: 1px solid #c3c3bd;
    border-bottom: 1px solid #c3c3bd;
    cursor: pointer;
    transition: background 0.08s ease;
}
.sudoku-easter-egg .se-cell.given {
    color: var(--se-cell-given);
    font-weight: 700;
    background: #ebeae3;
}
.sudoku-easter-egg .se-cell.selected {
    background: var(--se-cell-selected) !important;
}
.sudoku-easter-egg .se-cell.wrong {
    color: var(--se-cell-wrong);
}
.sudoku-easter-egg .se-cell.thick-right {
    border-right: 3px solid var(--se-border-thick);
}
.sudoku-easter-egg .se-cell.thick-bottom {
    border-bottom: 3px solid var(--se-border-thick);
}
.sudoku-easter-egg .se-palette {
    margin-top: 16px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    justify-content: center;
}
.sudoku-easter-egg .se-palette-btn {
    min-width: 38px;
    height: 38px;
    border-radius: 6px;
    border: 1px solid #3a3f4b;
    background: var(--se-panel);
    color: #eaeaea;
    font-size: 1rem;
    font-weight: 600;
}
.sudoku-easter-egg .se-palette-btn.erase {
    background: #4a2a2a;
}
.sudoku-easter-egg .se-footer {
    margin-top: 20px;
    text-align: center;
    color: #9aa0aa;
    font-size: 0.85rem;
}
`;

export default function Sudoku() {
    const [size, setSize] = useState(9);
    const [difficulty, setDifficulty] = useState("easy");
    const [countFromZero, setCountFromZero] = useState(false);
    const [puzzle, setPuzzle] = useState(null);
    const [solution, setSolution] = useState(null);
    const [values, setValues] = useState(null);
    const [selected, setSelected] = useState(null);
    const [generating, setGenerating] = useState(false);
    const [showSolved, setShowSolved] = useState(false);

    const preset = useMemo(() => getPreset(size), [size]);

    const newGame = useCallback(
        (nextSize = size, nextDifficulty = difficulty) => {
            setGenerating(true);
            setShowSolved(false);
            setTimeout(() => {
                const { puzzle: p, solution: s } = generatePuzzle(
                    nextSize,
                    nextDifficulty
                );
                setPuzzle(p);
                setSolution(s);
                setValues(p.map((row) => row.slice()));
                setSelected(null);
                setGenerating(false);
            }, 20);
        },
        [size, difficulty]
    );

    useEffect(() => {
        newGame(size, difficulty);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [size, difficulty]);

    const symbols = useMemo(
        () => getSymbols(size, countFromZero),
        [size, countFromZero]
    );

    const setCell = (row, col, value) => {
        if (!values || puzzle[row][col] !== 0) return;
        setValues((prev) => {
            const next = prev.map((r) => r.slice());
            next[row][col] = value;
            return next;
        });
    };

    const handleKeyDown = (e) => {
        if (!selected) return;
        const [r, c] = selected;
        if (e.key === "Backspace" || e.key === "Delete" || e.key === " ") {
            e.preventDefault();
            setCell(r, c, 0);
            return;
        }
        if (e.key.startsWith("Arrow")) {
            e.preventDefault();
            let nr = r;
            let nc = c;
            if (e.key === "ArrowUp") nr = Math.max(0, r - 1);
            if (e.key === "ArrowDown") nr = Math.min(size - 1, r + 1);
            if (e.key === "ArrowLeft") nc = Math.max(0, c - 1);
            if (e.key === "ArrowRight") nc = Math.min(size - 1, c + 1);
            setSelected([nr, nc]);
            return;
        }
        if (e.key.length === 1) {
            const v = symbolToValue(e.key, size, countFromZero);
            if (v !== 0) {
                e.preventDefault();
                setCell(r, c, v);
            }
        }
    };

    const isComplete = useMemo(() => {
        if (!values || !solution) return false;
        for (let i = 0; i < size; i++) {
            for (let j = 0; j < size; j++) {
                if (values[i][j] !== solution[i][j]) return false;
            }
        }
        return true;
    }, [values, solution, size]);

    const displayBoard = showSolved ? solution : values;

    return (
        <div className="sudoku-easter-egg">
            <style>{STYLES}</style>
            <div
                className="se-inner"
                onKeyDown={handleKeyDown}
                tabIndex={0}
            >
                <h1>Arbitrary Sudoku</h1>

                {!values ? (
                    <p>Loading…</p>
                ) : (
                    <>
                        <section className="se-controls">
                            <label>
                                Size:
                                <select
                                    value={size}
                                    onChange={(e) =>
                                        setSize(Number(e.target.value))
                                    }
                                >
                                    {SIZE_PRESETS.map((p) => (
                                        <option key={p.size} value={p.size}>
                                            {p.size}×{p.size} ({p.boxRows}×
                                            {p.boxCols} boxes)
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label>
                                Difficulty:
                                <select
                                    value={difficulty}
                                    onChange={(e) =>
                                        setDifficulty(e.target.value)
                                    }
                                >
                                    {DIFFICULTIES.map((d) => (
                                        <option key={d} value={d}>
                                            {d}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="se-toggle">
                                <input
                                    type="checkbox"
                                    checked={countFromZero}
                                    onChange={(e) =>
                                        setCountFromZero(e.target.checked)
                                    }
                                />
                                Count from 0
                            </label>

                            <button
                                onClick={() => newGame()}
                                disabled={generating}
                            >
                                {generating ? "Generating…" : "New Game"}
                            </button>
                            <button onClick={() => setShowSolved((s) => !s)}>
                                {showSolved ? "Hide Solution" : "Show Solution"}
                            </button>
                            <button
                                onClick={() =>
                                    setValues(puzzle.map((row) => row.slice()))
                                }
                            >
                                Reset
                            </button>
                        </section>

                        {isComplete && !showSolved && (
                            <div className="se-banner">Solved! 🎉</div>
                        )}

                        <Board
                            board={displayBoard}
                            puzzle={puzzle}
                            size={size}
                            boxRows={preset.boxRows}
                            boxCols={preset.boxCols}
                            countFromZero={countFromZero}
                            selected={selected}
                            onSelect={setSelected}
                            solution={solution}
                        />

                        <section className="se-palette">
                            {symbols.map((sym, idx) => (
                                <button
                                    key={sym}
                                    className="se-palette-btn"
                                    onClick={() => {
                                        if (selected)
                                            setCell(
                                                selected[0],
                                                selected[1],
                                                idx + 1
                                            );
                                    }}
                                >
                                    {sym}
                                </button>
                            ))}
                            <button
                                className="se-palette-btn erase"
                                onClick={() => {
                                    if (selected)
                                        setCell(selected[0], selected[1], 0);
                                }}
                            >
                                ⌫
                            </button>
                        </section>

                        <footer className="se-footer">
                            <p>
                                Click a cell, then type or click a symbol below.
                                Arrow keys move; Backspace clears.
                            </p>
                        </footer>
                    </>
                )}
            </div>
        </div>
    );
}

function Board({
    board,
    puzzle,
    size,
    boxRows,
    boxCols,
    countFromZero,
    selected,
    onSelect,
    solution,
}) {
    return (
        <div
            className="se-board"
            style={{
                gridTemplateColumns: `repeat(${size}, 1fr)`,
                gridTemplateRows: `repeat(${size}, 1fr)`,
            }}
        >
            {board.map((row, r) =>
                row.map((val, c) => {
                    const isGiven = puzzle[r][c] !== 0;
                    const isSelected =
                        selected && selected[0] === r && selected[1] === c;
                    const isWrong =
                        !isGiven &&
                        val !== 0 &&
                        solution &&
                        val !== solution[r][c];
                    const thickRight =
                        (c + 1) % boxCols === 0 && c !== size - 1;
                    const thickBottom =
                        (r + 1) % boxRows === 0 && r !== size - 1;
                    const classes = [
                        "se-cell",
                        isGiven ? "given" : "",
                        isSelected ? "selected" : "",
                        isWrong ? "wrong" : "",
                        thickRight ? "thick-right" : "",
                        thickBottom ? "thick-bottom" : "",
                    ]
                        .filter(Boolean)
                        .join(" ");
                    return (
                        <div
                            key={`${r}-${c}`}
                            className={classes}
                            onClick={() => onSelect([r, c])}
                        >
                            {valueToSymbol(val, size, countFromZero)}
                        </div>
                    );
                })
            )}
        </div>
    );
}
