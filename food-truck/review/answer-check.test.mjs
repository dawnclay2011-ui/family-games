/**
 * Checker tests for the practice review shift.
 * Run: node food-truck/review/answer-check.test.mjs
 */
import fs from "fs";
import vm from "vm";
import { fileURLToPath } from "url";
import path from "path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
const match = html.match(/<script id="logic">([\s\S]*?)<\/script>/);
if (!match) throw new Error("logic script missing");

const context = {
  console,
  Math,
  Number,
  String,
  RegExp,
  JSON,
  Date,
  BigInt,
  parseFloat,
  isFinite,
  isNaN,
  Function,
  Array,
  Object,
  URLSearchParams,
  encodeURIComponent,
  decodeURIComponent,
  location: { search: "" },
  document: undefined,
  navigator: { onLine: true }
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(match[1], context, { filename: "review-logic.js" });

const { PROBLEMS, checkAnswer, roundedNumber } = context.FoodTruckReview;
const failures = [];

function expect(cond, label) {
  if (!cond) failures.push(label);
}

function codeOf(problem, raw) {
  return checkAnswer(problem, raw).code;
}

function byId(id) {
  return PROBLEMS.find((p) => p.id === id);
}

const day9Number = {
  kind: "number",
  id: "day9-followers",
  initial: 500,
  factor: "1.1",
  steps: 3,
  places: 1,
  stepUnit: "weeks"
};
const day9Model = {
  kind: "model",
  id: "day9-value",
  fname: "V",
  variable: "t",
  initial: 40000,
  factor: "0.85",
  wrongFactors: [
    { factor: "0.15", note: "Losing 15% leaves 0.85, not 0.15." },
    { factor: "1.15", note: "1.15 would be growth. Decay uses 0.85." }
  ]
};

expect(roundedNumber(500, "1.1", 3, 1).text === "665.5", "day9 official 665.5");
expect(byId("crowd-3").text === "449.6", "crowd after 3 weeks is 449.6");
expect(byId("grill-3").text === "1868.85", "grill after 3 years is 1868.85");
expect(byId("catering-4").text === "946.9", "catering after 4 months is 946.9");

function expectCode(problem, raw, code, label) {
  const got = checkAnswer(problem, raw);
  expect(got.code === code, `${label}: "${raw}" → ${got.code} (${got.message}) expected ${code}`);
  if (code !== "ok" && code !== "empty") {
    const key = problem.kind === "number"
      ? (problem.text || roundedNumber(problem.initial, problem.factor, problem.steps, problem.places).text)
      : `${problem.initial}(${problem.factor})^${problem.variable}`;
    // The form example V(t) = 40000(0.85)^t is supposed to appear in the missing-exponent hint.
    if (key !== "40000(0.85)^t") {
      expect(!got.message.includes(key), `${label}: wrong-answer message leaked the key ${key}: ${got.message}`);
    }
  }
}

["665.5", "665.50", "665.500", "$665.50", "665.5 customers"].forEach((raw) => {
  expectCode(day9Number, raw, "ok", "day9 format");
});
expectCode(day9Number, "660", "early", "day9 early 660");
expectCode(day9Number, "660.0", "early", "day9 early 660.0");
expectCode(day9Number, "665", "early", "day9 early 665");
expectCode(day9Number, "666", "coarser", "day9 whole-number round");
expectCode(day9Number, "665.5001", "ok", "day9 tiny float still the tenth");

[
  "40000(0.85)^t",
  "40000 (0.85) ^ t",
  "40000*0.85^t",
  "40000 * 0.85 ^ t",
  "V(t) = 40000(0.85)^t",
  "v(t)=40,000(0.85)^t",
  "40000×0.85^t",
  "40000·0.85^t",
  "40000(0.85)**t",
  "(40000)(0.85)^t",
  "40000*(0.85)^t",
  "0.85^t*40000",
  "40000*(85/100)^t",
  "40000(0.85^t)",
  "V = 40000(0.85)^t",
  "40000(0.850)^t"
].forEach((raw) => expectCode(day9Model, raw, "ok", "day9 model format"));

[
  "40000(0.85)",
  "40000*0.85",
  "V(t) = 40000(0.85)",
  "40000(0.85)t",
  "40000*0.85*t",
  "40000*0.85t",
  "40,000 (0.85)",
  "V(t)=40000*0.85"
].forEach((raw) => {
  expectCode(day9Model, raw, "exponent", "day9 missing exponent");
  const msg = checkAnswer(day9Model, raw).message;
  expect(/40000\(0\.85\)\^t/.test(msg) && /exponent/i.test(msg), `missing-exponent hint text for "${raw}": ${msg}`);
});
expectCode(day9Model, "40000(0.15)^t", "factor", "day9 loss percent as factor");
expectCode(day9Model, "40000(1.15)^t", "factor", "day9 growth factor on decay");
expectCode(day9Model, "40000^t", "base", "day9 exponent on the starting value");

const crowd = byId("crowd-model");
const crowdN = byId("crowd-3");
const grill = byId("grill-model");
const grillN = byId("grill-3");
const freezer = byId("freezer-model");
const catering = byId("catering-4");

[
  "320(1.12)^w",
  "320 (1.12) ^ w",
  "320*1.12^w",
  "320*(1.12)^w",
  "C(w) = 320(1.12)^w",
  "c(w)=320(1.12)^w",
  "320*(1+0.12)^w",
  "320*(1+.12)^w",
  "320(112%)^w",
  "320(1.12)**w",
  "1.12^w*320",
  "320(1.12)^x"
].forEach((raw) => expectCode(crowd, raw, "ok", "crowd model"));
["320(1.12)", "320*1.12", "C(w)=320(1.12)", "320(1.12)w", "320*1.12*w", "320*1.12w"].forEach((raw) => {
  expectCode(crowd, raw, "exponent", "crowd missing exponent");
});
expectCode(crowd, "320*(1+0.12)", "exponent", "crowd 1+0.12 without exponent");
expect(checkAnswer(crowd, "320*(1+0.12)").message.includes("1.12") === false || !/not a factor of 0\.12/.test(checkAnswer(crowd, "320*(1+0.12)").message), "1+0.12 is not scolded as the wrong factor");
expectCode(crowd, "320(0.12)^w", "factor", "crowd percent as factor");
expectCode(crowd, "320(1.012)^w", "factor", "crowd 1.012");
expectCode(crowd, "320(0.88)^w", "factor", "crowd decay factor");
expectCode(crowd, "", "empty", "crowd empty");
expectCode(crowd, "hello", "invalid", "crowd junk");

["449.6", "449.60", "449.600", "$449.60", "449.6 customers"].forEach((raw) => expectCode(crowdN, raw, "ok", "crowd number"));
expectCode(crowdN, "449.57696", "finer", "crowd unrounded");
expectCode(crowdN, "449.58", "finer", "crowd hundredths");
expectCode(crowdN, "450", "coarser", "crowd whole");
expectCode(crowdN, "448", "early", "crowd power rounded to 1.40");
expectCode(crowdN, "449.1", "early", "crowd intermediate whole");
expectCode(crowdN, "451.6", "early", "crowd intermediate ten");
expectCode(crowdN, "401.4", "steps", "crowd stopped at 2 weeks");
expectCode(crowdN, "100", "wrong", "crowd unrelated");
expectCode(crowdN, "abc", "invalid", "crowd not a number");

[
  "2400(0.92)^t",
  "V(t) = 2,400(0.92)^t",
  "2400*0.92^t",
  "2400 (0.92) ^ t",
  "2400*(92/100)^t",
  "2400*(1-0.08)^t",
  "2400(92%)^t",
  "2400(0.92)^x",
  "$2400(0.92)^t"
].forEach((raw) => expectCode(grill, raw, "ok", "grill model"));
["2400(0.92)", "2400*0.92", "V(t)=2400(0.92)", "2400(0.92)t", "2400*0.92*t", "2,400 (0.92)"].forEach((raw) => {
  expectCode(grill, raw, "exponent", "grill missing exponent");
});
expectCode(grill, "2400(0.08)^t", "factor", "grill 0.08");
expectCode(grill, "2400(1.08)^t", "factor", "grill 1.08");
expectCode(grill, "2400^t", "base", "grill exponent on 2400");

["1868.85", "1,868.85", "$1,868.85", "1868.850", "1868.85 dollars"].forEach((raw) => expectCode(grillN, raw, "ok", "grill number"));
expectCode(grillN, "1868.8512", "finer", "grill full precision");
expectCode(grillN, "1869", "coarser", "grill nearest dollar");
expectCode(grillN, "1868.9", "coarser", "grill nearest tenth");
expectCode(grillN, "1872", "early", "grill power to hundredths");
expectCode(grillN, "1868.52", "early", "grill rounded year-2 count");
expectCode(grillN, "1869.60", "early", "grill power to thousandths");
expectCode(grillN, "2031.36", "steps", "grill stopped at 2 years");

[
  "1850(0.92)^m",
  "F(m)=1,850(0.92)^m",
  "1850*(1-0.08)^m",
  "1850(92%)^m",
  "1850 * 0.92 ^ m"
].forEach((raw) => expectCode(freezer, raw, "ok", "freezer model"));
expectCode(freezer, "1850(0.92)", "exponent", "freezer missing exponent");
expectCode(freezer, "1850*0.92*m", "exponent", "freezer times m");
expectCode(freezer, "F(m)=1850(0.92)", "exponent", "freezer function without exponent");
const both = checkAnswer(freezer, "1850(0.08)");
expect(both.code === "exponent", `freezer 1850(0.08) code ${both.code}`);
expect(/0\.92/.test(both.message) && /exponent/i.test(both.message), `freezer 1850(0.08) mentions both issues: ${both.message}`);
expectCode(freezer, "1850(0.08)^m", "factor", "freezer 0.08 with exponent");
expectCode(freezer, "1850(1.08)^m", "factor", "freezer growth factor");

["946.9", "946.90", "946.900"].forEach((raw) => expectCode(catering, raw, "ok", "catering number"));
expectCode(catering, "946.85772", "finer", "catering full value");
expectCode(catering, "947", "coarser", "catering whole");
expectCode(catering, "945", "early", "catering power to 1.26");
expectCode(catering, "946.5", "early", "catering power to 1.262");
expectCode(catering, "946.6", "early", "catering rounded month 3");
expectCode(catering, "943.8", "early", "catering rounded to ten");
expectCode(catering, "893.3", "steps", "catering stopped at 3 months");

const earlyMsg = checkAnswer(day9Number, "660").message;
expect(/round/i.test(earlyMsg) && /last step|before the last|until the end|whole calculation/i.test(earlyMsg), "660 hint talks about rounding too early: " + earlyMsg);
expect(!/665\.5/.test(earlyMsg), "660 hint does not reveal 665.5");

if (failures.length) {
  console.error(failures.map((f) => "FAIL " + f).join("\n"));
  process.exit(1);
}
console.log("answer-check: " + (failures.length === 0 ? "all passed" : "failed"));
