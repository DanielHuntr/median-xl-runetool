// Safe evaluator for skill scaling formulas such as "frames(if([[execution]],275,25))"
// or "floor((293*lvl-2)/12)". Formulas come from third-party data, so they are
// parsed with a small recursive-descent parser. Nothing is passed to eval() or
// new Function().
//
// Semantics follow medianxl-db's FormulaEvaluator (MIT): floating-point maths,
// with the final result truncated to an integer unless frames() or range() was
// used (those keep two decimals).

const FPS = 25;
const FUNCS = {
  floor: Math.floor,
  ceil: Math.ceil,
  round: (v, d = 0) => Math.round(v * 10 ** d) / 10 ** d,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  frames: (f) => Math.floor((f / FPS) * 100) / 100,
  range: (feet) => Math.floor((feet * 0.3 + Math.floor(feet / 3) * 0.1) * 1000) / 1000,
  bool: (v) => (v === 0 ? 0 : 1),
  if: (c, a, b) => (c ? a : b),
  ln: (a, b, lvl) => (Number(a) || 0) + (Number(b) || 0) * ((Number(lvl) || 1) - 1),
  dm: (a, b, lvl) => {
    const l = Number(lvl) || 1;
    return Math.floor(a + (110 * l * (b - a)) / (100 * (l + 6)));
  },
};
const VARS = new Set(["blvl", "slvl", "lvl", "ulvl"]);

function tokenize(src) {
  const out = [];
  const re =
    /\s*(?:(\d+(?:\.\d+)?|\.\d+)|\[\[([A-Za-z0-9_-]+)\]\](?:\.\{\{([A-Za-z0-9_]+)\}\})?|\{\{([A-Za-z0-9_]+)\}\}|([A-Za-z_][A-Za-z0-9_]*)|(<=|>=|==|!=|[-+*/(),<>]))/y;
  let i = 0;
  while (i < src.length) {
    if (/^\s+$/.test(src.slice(i))) break;
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m) throw new Error(`Unexpected "${src.slice(i, i + 8)}"`);
    i = re.lastIndex;
    if (m[1] !== undefined) out.push({ t: "num", v: Number(m[1]) });
    else if (m[2] !== undefined) out.push({ t: "skill", v: m[2], stat: m[3] });
    else if (m[4] !== undefined) out.push({ t: "stat", v: m[4] });
    else if (m[5] !== undefined) out.push({ t: "id", v: m[5] });
    else out.push({ t: "op", v: m[6] });
  }
  return out;
}

/**
 * @param {string} src
 * @param {{
 *   vars: { blvl: number, slvl: number, lvl: number, ulvl: number },
 *   skillLevel: (id: string) => number,
 *   skillStat: (id: string, stat: string) => number,
 *   stat?: (key: string) => number | undefined,
 *   treePoints: (tabId: number) => number,
 * }} ctx
 * @returns {{ value: number, usesStats: boolean, usesConditions: boolean }}
 */
export function evaluate(src, ctx) {
  const tokens = tokenize(String(src));
  let pos = 0;
  let decimal = false,
    usesStats = false,
    usesConditions = false;
  const peek = () => tokens[pos];
  const isOp = (v) => peek()?.t === "op" && peek().v === v;
  const expect = (v) => {
    if (!isOp(v)) throw new Error(`Expected "${v}"`);
    pos++;
  };

  function comparison() {
    let l = additive();
    while (peek()?.t === "op" && ["<", ">", "<=", ">=", "==", "!="].includes(peek().v)) {
      const op = tokens[pos++].v;
      const r = additive();
      l = { "<": l < r, ">": l > r, "<=": l <= r, ">=": l >= r, "==": l === r, "!=": l !== r }[op] ? 1 : 0;
    }
    return l;
  }
  function additive() {
    let l = term();
    while (isOp("+") || isOp("-")) l = tokens[pos++].v === "+" ? l + term() : l - term();
    return l;
  }
  function term() {
    let l = unary();
    while (isOp("*") || isOp("/")) l = tokens[pos++].v === "*" ? l * unary() : l / unary();
    return l;
  }
  function unary() {
    if (isOp("-")) return pos++, -unary();
    if (isOp("+")) return pos++, unary();
    return primary();
  }
  function primary() {
    const tok = tokens[pos++];
    if (!tok) throw new Error("Unexpected end of formula");
    if (tok.t === "num") return tok.v;
    if (tok.t === "skill")
      return tok.stat ? ctx.skillStat(tok.v, tok.stat.toLowerCase()) : ctx.skillLevel(tok.v);
    if (tok.t === "stat") {
      // Character stats come from the character sheet when the caller has one.
      const v = ctx.stat?.(tok.v.toLowerCase());
      if (typeof v === "number") return v;
      usesStats = true;
      return 0;
    }
    if (tok.t === "op" && tok.v === "(") {
      const v = comparison();
      expect(")");
      return v;
    }
    if (tok.t === "id") {
      if (isOp("(")) {
        pos++;
        if (tok.v === "cond") {
          // Planner conditions ("while wielding a two-handed weapon") are not modelled yet.
          if (peek()?.t !== "id") throw new Error("cond() needs a condition name");
          pos++;
          expect(")");
          usesConditions = true;
          return 0;
        }
        const args = [];
        if (!isOp(")")) {
          args.push(comparison());
          while (isOp(",")) {
            pos++;
            args.push(comparison());
          }
        }
        expect(")");
        if (tok.v === "tree") return ctx.treePoints(args[0]);
        const fn = FUNCS[tok.v];
        if (!fn) throw new Error(`Unknown function ${tok.v}`);
        if (tok.v === "frames" || tok.v === "range") decimal = true;
        return fn(...args);
      }
      if (VARS.has(tok.v)) return ctx.vars[tok.v];
      throw new Error(`Unknown name ${tok.v}`);
    }
    throw new Error(`Unexpected "${tok.v}"`);
  }

  const raw = comparison();
  if (pos !== tokens.length) throw new Error(`Unexpected "${tokens[pos].v}"`);
  if (!Number.isFinite(raw)) throw new Error("Result is not a finite number");
  return {
    value: decimal ? Math.round(raw * 100) / 100 : Math.trunc(raw),
    usesStats,
    usesConditions,
  };
}

// Labels such as "Knights" or "Kill/Death Blow" appear where a value is plain text.
// Only consulted after evaluate() has failed, so "blvl/3" never reaches it.
export function isPlainText(s) {
  const t = String(s).trim();
  if (!t || VARS.has(t.toLowerCase())) return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return false;
  if (/[[\]{}()*+=<>!]/.test(t)) return false;
  return /^[A-Za-z][\w\s'\-.,:/]*$/.test(t);
}
