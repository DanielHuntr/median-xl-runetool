// Interpreter for Diablo II / Median XL compiled skill formulas ("calcs", from
// skillscode.bin). Formulas are postfix bytecode, evaluated with 32-bit integer
// maths (each operation truncates), as the game does.
//
// Every opcode records how it's known. "confirmed" ones reproduce in-game tooltips;
// "inferred" ones come from the structure of all 7,449 game formulas (each must use
// exactly its bytes and leave one value; with these definitions 7,449 of 7,449 do) and
// from how they're used, e.g. "lvl < 41 ? 5 × lvl : 120 + 2 × lvl" meeting at level 40.
// Results that use an inferred opcode or function are reported as not yet checked in
// game. Anything else is reported as undecoded and never guessed at.
export const OPCODES = {
  0x00: { name: "end", size: 0, confirmed: "terminates every formula" },
  0x01: { name: "func", size: 1, confirmed: "function call: 0 = min, 1 = max (Way of the Spider, 2.14.4)" },
  0x04: { name: "var", size: 1, confirmed: "skillcalc.bin variable index" },
  0x07: { name: "int8", size: 1, confirmed: "1-byte constant" },
  0x08: { name: "int16", size: 2, confirmed: "2-byte little-endian constant" },
  0x09: { name: "int32", size: 4, inferred: "4-byte constant (09 50 c3 00 00 = 50000)" },
  0x0a: { name: "<", size: 0, arity: 2, inferred: "lvl < 41 ? 5 × lvl : 120 + 2 × lvl (equal at 40)" },
  0x0b: { name: ">", size: 0, arity: 2, inferred: "ulvl > 11 ? cubic curve : linear start" },
  0x0c: { name: "<=", size: 0, arity: 2, inferred: "range check: (x >= 1990) × (x <= 2010)" },
  0x0d: { name: ">=", size: 0, arity: 2, inferred: "range check: (x >= 1990) × (x <= 2010)" },
  0x0e: { name: "==", size: 0, arity: 2, inferred: "chains like x == 29 ? … : x == 30 ? …" },
  0x0f: { name: "!=", size: 0, arity: 2, inferred: "skill level != 0 ? bonus : 0" },
  0x10: { name: "+", size: 0, arity: 2, confirmed: "Way of the Spider tooltip reproduction" },
  0x11: { name: "-", size: 0, arity: 2, confirmed: "Way of the Spider tooltip reproduction" },
  0x12: { name: "*", size: 0, arity: 2, confirmed: "Way of the Spider tooltip reproduction" },
  0x13: { name: "/", size: 0, arity: 2, confirmed: "Way of the Spider tooltip reproduction" },
  0x15: { name: "neg", size: 0, arity: 1, inferred: "unary minus: always used as neg(1) × x" },
  0x16: { name: "?:", size: 0, arity: 3, inferred: "condition ? a : b, after a comparison" },
};
// Function ids after opcode 0x01, with argument counts fixed by the same parse check.
// min/max are confirmed; the rest are inferred from where they appear (see note).
export const FUNCTIONS = {
  0: { name: "min", args: 2, confirmed: true },
  1: { name: "max", args: 2, confirmed: true },
  2: { name: "rand", args: 2, confirmed: false, note: "(min, max) random roll, e.g. rand(0, 99) < chance" },
  3: { name: "skillref", args: 2, confirmed: false, note: "(skill id, variable) of another skill" },
  4: { name: "missref", args: 2, confirmed: false, note: "(id, variable) of a missile; missile data isn't extracted" },
  5: { name: "statref", args: 2, confirmed: false, note: "(stat id, layer): a stat on the character" },
  7: { name: "state", args: 1, confirmed: false, note: "(state id): whether the character has that state" },
  10: { name: "func10", args: 1, confirmed: false, note: "(n): hard points in the class's nth skill tree (Death Pact)" },
  11: { name: "statsrc", args: 3, confirmed: false, note: "(stat id, layer, n): a stat from a particular source" },
  13: { name: "unitstat", args: 2, confirmed: false, note: "(n, stat id): a stat of a related unit" },
};

const i32 = (n) => n | 0;
const div = (a, b) => (b === 0 ? 0 : i32(Math.trunc(a / b)));

/** Splits bytecode into tokens, or reports why it can't be decoded. */
export function decode(bytes) {
  const tokens = [];
  // Stack depth: every formula must leave exactly one value and never underflow.
  let depth = 0;
  for (let p = 0; p < bytes.length; ) {
    const op = bytes[p];
    const def = OPCODES[op];
    if (!def) return { ok: false, reason: `unconfirmed opcode 0x${op.toString(16)}`, tokens, length: null };
    if (op === 0x00)
      return depth === 1 ? { ok: true, tokens, length: p + 1 } : { ok: false, reason: "unbalanced formula", tokens, length: null };
    const pops = op === 0x01 ? FUNCTIONS[bytes[p + 1]]?.args ?? 0 : def.arity ?? 0;
    if (depth < pops) return { ok: false, reason: "unbalanced formula", tokens, length: null };
    depth += 1 - pops;
    let arg = null;
    if (def.size === 1) arg = bytes[p + 1];
    if (def.size === 2) arg = bytes[p + 1] | (bytes[p + 2] << 8);
    if (def.size === 4) arg = (bytes[p + 1] | (bytes[p + 2] << 8) | (bytes[p + 3] << 16) | (bytes[p + 4] << 24)) | 0;
    if (op === 0x07 && arg > 127) arg -= 256;
    if (op === 0x08 && arg > 32767) arg -= 65536;
    if (op === 0x01 && !FUNCTIONS[arg]) return { ok: false, reason: `unknown function ${arg}`, tokens, length: null };
    tokens.push({ op: def.name, arg });
    p += 1 + def.size;
  }
  return { ok: false, reason: "no terminator", tokens, length: null };
}

/**
 * Evaluates decoded tokens.
 * @param {{op: string, arg: number|null}[]} tokens
 * @param {{ variable: (name: string) => number, func?: (name: string, args: number[]) => number }} ctx
 *   `variable` receives skillcalc names ("ln12", "blvl", "edmn", …) and must throw for unknown ones.
 */
export function run(tokens, ctx, names) {
  const stack = [];
  const pop = () => {
    if (!stack.length) throw new Error("formula stack underflow");
    return stack.pop();
  };
  // A value that can't be worked out is carried as { unknown: reason } and only fails the
  // formula if the result depends on it: unknown × 0 is 0 (Blood Skeleton's damage reads
  // Flameburst Shot's exma × a term that is 0 at First Level), and ?: ignores the branch
  // it doesn't take.
  const unknown = (x) => typeof x === "object";
  const attempt = (fn) => {
    try {
      return fn();
    } catch (e) {
      return { unknown: e.message };
    }
  };
  for (const t of tokens) {
    if (t.op === "int8" || t.op === "int16" || t.op === "int32") stack.push(t.arg);
    // skillcalc.bin names are padded to 4 characters ("lvl ", "len ").
    else if (t.op === "var") stack.push(attempt(() => i32(ctx.variable(names[t.arg]?.trim() ?? `var${t.arg}`))));
    else if (t.op === "func") {
      const f = FUNCTIONS[t.arg];
      const args = [];
      for (let k = 0; k < f.args; k++) args.unshift(pop());
      const bad = args.find(unknown);
      if (bad) stack.push(bad);
      else if (f.name === "min") stack.push(Math.min(...args));
      else if (f.name === "max") stack.push(Math.max(...args));
      else if (ctx.func) stack.push(attempt(() => i32(ctx.func(f.name, args))));
      else throw new Error(`${f.name} isn't available here`);
    } else if (t.op === "neg") {
      const a = pop();
      stack.push(unknown(a) ? a : i32(-a));
    } else if (t.op === "?:") {
      const no = pop(), yes = pop(), cond = pop();
      stack.push(unknown(cond) ? (!unknown(yes) && yes === no ? yes : cond) : cond ? yes : no);
    } else {
      const b = pop(), a = pop();
      if (unknown(a) || unknown(b)) {
        stack.push(t.op === "*" && (a === 0 || b === 0) ? 0 : unknown(a) ? a : b);
        continue;
      }
      stack.push(
        t.op === "+" ? i32(a + b)
        : t.op === "-" ? i32(a - b)
        : t.op === "*" ? i32(Math.imul(a, b))
        : t.op === "/" ? div(a, b)
        : t.op === "<" ? +(a < b)
        : t.op === ">" ? +(a > b)
        : t.op === "<=" ? +(a <= b)
        : t.op === ">=" ? +(a >= b)
        : t.op === "==" ? +(a === b)
        : +(a !== b),
      );
    }
  }
  if (stack.length !== 1) throw new Error("formula left an uneven stack");
  if (unknown(stack[0])) throw new Error(stack[0].unknown);
  return stack[0];
}

/** Readable infix text for a decoded formula, for the UI's "show formula". */
export function toText(tokens, names, labels = {}) {
  const stack = [];
  const PREC = { "<": 0, ">": 0, "<=": 0, ">=": 0, "==": 0, "!=": 0, "+": 1, "-": 1, "*": 2, "/": 2 };
  for (const t of tokens) {
    if (t.op === "int8" || t.op === "int16" || t.op === "int32") stack.push({ s: String(t.arg), p: 9 });
    else if (t.op === "neg") {
      const a = stack.pop();
      stack.push({ s: `-${a.p < 9 ? `(${a.s})` : a.s}`, p: 9 });
    } else if (t.op === "?:") {
      const [c, y, n] = stack.splice(stack.length - 3, 3);
      stack.push({ s: `(${c.s} ? ${y.s} : ${n.s})`, p: 9 });
    }
    else if (t.op === "var") stack.push({ s: names[t.arg]?.trim() ?? `var${t.arg}`, p: 9 });
    else if (t.op === "func") {
      const f = FUNCTIONS[t.arg];
      const args = stack.splice(stack.length - f.args, f.args).map((x) => x.s);
      const label = f.name === "skillref" ? `skill(${labels.skill?.(args[0]) ?? args[0]}).${names[args[1]]?.trim() ?? args[1]}` : f.name === "statref" ? `stat(${labels.stat?.(args[0]) ?? args[0]})` : `${f.name}(${args.join(", ")})`;
      stack.push({ s: label, p: 9 });
    } else {
      const b = stack.pop(), a = stack.pop(), p = PREC[t.op];
      const wrap = (x, right) => (x.p < p || (right && x.p === p && (t.op === "-" || t.op === "/")) ? `(${x.s})` : x.s);
      stack.push({ s: `${wrap(a)} ${t.op} ${wrap(b, true)}`, p });
    }
  }
  return stack.map((x) => x.s).join(" ; ");
}

// ---------- Skill variables (skillcalc.bin names) with the D2 level brackets.

// Elemental damage per-level tables apply by level bracket: EMinLev[0] for levels
// 2–8, [1] 9–16, [2] 17–22, [3] 23–28, [4] 29+ (D2 1.13c; the bracket sizes are
// confirmed by the exact Way of the Spider reproduction at levels 41 and 42).
const BRACKETS = [[2, 8], [9, 16], [17, 22], [23, 28], [29, Infinity]];
export function levelTableSum(base, perLevel, lvl) {
  if (lvl < 1) return 0;
  let total = base;
  BRACKETS.forEach(([lo, hi], i) => {
    if (lvl >= lo) total += (Math.min(lvl, hi) - lo + 1) * (perLevel[i] || 0);
  });
  return total;
}
// Elemental length: ELevLen[0] for levels 2–8, [1] 9–16, [2] 17+.
const LEN_BRACKETS = [[2, 8], [9, 16], [17, Infinity]];
export function lengthFrames(len, perLevel, lvl) {
  if (lvl < 1) return 0;
  let total = len;
  LEN_BRACKETS.forEach(([lo, hi], i) => {
    if (lvl >= lo) total += (Math.min(lvl, hi) - lo + 1) * (perLevel[i] || 0);
  });
  return total;
}
