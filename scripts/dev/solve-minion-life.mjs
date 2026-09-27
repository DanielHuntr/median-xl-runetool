// Dev check: node scripts/dev/solve-minion-life.mjs — which model of minion life (mnhp)
// reproduces the in-game Blood Skeleton and Guardian Spirit tooltips.
// Observations: [skill level, Base Level, shown life]; life = mnhp × multiplier (game line).
const T = Math.trunc;
const obs = {
  blood: { par: [0, 200, 40, 40], mult: 1, synPer: 0, points: [[1, 1, 121], [2, 1, 242], [2, 2, 242], [3, 2, 363]] },
  guardian: { par: [0, 200, 11, 5], mult: 4, synPer: 9, points: [[1, 1, 144], [2, 1, 212], [2, 2, 228], [3, 2, 300]] },
};
const ln34 = (p, L) => p[2] + (L - 1) * p[3];
const models = {
  "base × (100+par2)% × charf, then × (100+syn×B)%": (p, L, B, u, s) => T(T((ln34(p, L) * (100 + p[1]) * (10000 + u * u)) / 1000000) * (100 + s * B) / 100),
  "all multiplied, one trunc": (p, L, B, u, s) => T((ln34(p, L) * (100 + p[1]) * (10000 + u * u) * (100 + s * B)) / 100000000),
  "syn is 1 + syn×B (clc1)": (p, L, B, u, s) => T((ln34(p, L) * (100 + p[1]) * (10000 + u * u) * (100 + (s ? 1 + s * B : 0))) / 100000000),
  "charf after syn": (p, L, B, u, s) => T(T((ln34(p, L) * (100 + p[1]) * (100 + s * B)) / 10000) * (10000 + u * u) / 10000),
};
for (const [name, f] of Object.entries(models)) {
  const ok = {};
  for (const [k, o] of Object.entries(obs)) {
    ok[k] = [];
    for (let u = 1; u <= 150; u++) if (o.points.every(([L, B, life]) => f(o.par, L, B, u, o.synPer) * o.mult === life)) ok[k].push(u);
  }
  console.log(name.padEnd(52), "Blood Skeleton ulvl:", ok.blood.join(",") || "none", "| Guardian ulvl:", ok.guardian.join(",") || "none");
}
