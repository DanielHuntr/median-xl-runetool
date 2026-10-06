import { gameText } from "./scripts/lib/item-text.mjs";
const g = gameText();
const isc = g.X("itemstatcost.bin", 324);
const find = (re) => { for (let s = 0; s < isc.count; s++) { const d = g.data.stats[s]; if (re.test(d[2] || "") || re.test(d[3] || "")) console.log(s, JSON.stringify(d), "dgrp", isc.record(s).readUInt16LE(0x3e)); } };
for (const re of [/Cooldown Reduced/, /Flee/, /Activation Frequency/, /Vendor Prices/, /Stamina Drain/, /Charges/]) { console.log("==", re); find(re); }
