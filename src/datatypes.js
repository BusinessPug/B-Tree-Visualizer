// Key data-types supported by the visualiser. Each entry packages the
// behaviour the rest of the app needs to stay agnostic to the underlying
// value type:
//
//   parse(raw)   – turn the input field's string into a comparable value
//                  (or return null for invalid input)
//   compare(a,b) – three-way comparator used by the tree; returns <0, 0, >0
//   random()     – pick a random value of this type for the "Random Fill"
//                  feature; uniqueness is handled by the caller
//   display(v)   – render a value as a string for log messages
//
// The `inputType`/`inputStep`/`maxLength`/`placeholder` fields just feed
// the controlled <input> in MainComponent so each type gets a sensible
// editing experience (numeric spinner vs free text vs single character).
//
// `randomKeyspace` is an optional upper bound on how many distinct values
// exist. The Random Fill loop uses it to cap the requested count so it
// never enters an infinite "find a unique value" spin for tiny domains
// like single characters (only 94 printable ASCII codepoints).

export const DATATYPES = {
  integer: {
    label: 'Integer',
    inputType: 'number',
    inputStep: '1',
    placeholder: 'Enter integer key',
    parse: (s) => {
      if (typeof s !== 'string' || s.trim() === '') return null;
      const v = Number.parseInt(s, 10);
      return Number.isFinite(v) ? v : null;
    },
    compare: (a, b) => (a < b ? -1 : a > b ? 1 : 0),
    // Random Fill samples uniformly from [start, end] (inclusive). The
    // user picks the range in the controls; defaults are supplied below.
    randomRange: {
      kind: 'integer',
      defaultStart: 0,
      defaultEnd: 1000,
      parse: (s) => {
        if (typeof s !== 'string' || s.trim() === '') return null;
        const v = Number.parseInt(s, 10);
        return Number.isFinite(v) ? v : null;
      },
    },
    random: (start = 0, end = 0x7fffffff - 1) => {
      const lo = Math.min(start, end);
      const hi = Math.max(start, end);
      return Math.floor(Math.random() * (hi - lo + 1)) + lo;
    },
    randomKeyspaceForRange: (start, end) => {
      const lo = Math.min(start, end);
      const hi = Math.max(start, end);
      return hi - lo + 1;
    },
    display: (v) => String(v),
  },
  float: {
    label: 'Float',
    inputType: 'number',
    inputStep: 'any',
    placeholder: 'Enter decimal key',
    parse: (s) => {
      if (typeof s !== 'string' || s.trim() === '') return null;
      const v = Number.parseFloat(s);
      return Number.isFinite(v) ? v : null;
    },
    compare: (a, b) => (a < b ? -1 : a > b ? 1 : 0),
    // Two-decimal floats over a user-chosen range. Defaults match the
    // integer range so the controls behave consistently.
    randomRange: {
      kind: 'float',
      defaultStart: 0,
      defaultEnd: 1000,
      parse: (s) => {
        if (typeof s !== 'string' || s.trim() === '') return null;
        const v = Number.parseFloat(s);
        return Number.isFinite(v) ? v : null;
      },
    },
    random: (start = 0, end = 10_000) => {
      const lo = Math.min(start, end);
      const hi = Math.max(start, end);
      return Math.round((Math.random() * (hi - lo) + lo) * 100) / 100;
    },
    display: (v) => String(v),
  },
  string: {
    label: 'String',
    inputType: 'text',
    placeholder: 'Enter string key',
    parse: (s) => {
      if (typeof s !== 'string') return null;
      const t = s.trim();
      return t.length === 0 ? null : t;
    },
    // Lexicographic order. JS's `<` on strings already implements this,
    // but we go through a comparator so the tree code itself stays type-
    // agnostic.
    compare: (a, b) => (a < b ? -1 : a > b ? 1 : 0),
    random: () => {
      const len = 3 + Math.floor(Math.random() * 4); // 3..6 chars
      let s = '';
      for (let i = 0; i < len; i++) {
        s += String.fromCharCode(97 + Math.floor(Math.random() * 26));
      }
      return s;
    },
    display: (v) => `"${v}"`,
  },
  char: {
    label: 'Char',
    inputType: 'text',
    placeholder: 'Single character',
    maxLength: 1,
    parse: (s) => {
      if (typeof s !== 'string' || s.length === 0) return null;
      return s[0];
    },
    compare: (a, b) => (a < b ? -1 : a > b ? 1 : 0),
    // Printable ASCII (! through ~) — 94 distinct values, used as the
    // upper bound by Random Fill so we don't spin forever.
    random: () => String.fromCharCode(33 + Math.floor(Math.random() * 94)),
    randomKeyspace: 94,
    display: (v) => `'${v}'`,
  },
};

export const DEFAULT_DATATYPE = 'integer';
