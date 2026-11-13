import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  USER_COPY,
  buildSharePayload,
  buildSummary,
  createMemoryStorage,
  emptyRecord,
  formatDateHeading,
  getDayContent,
  getMark,
  getNote,
  loadRecord,
  messageForCopy,
  messageForShare,
  parsePlan,
  resolveMaterials,
  runCopy,
  runSend,
  setMark,
  setNote,
  storageKey,
  todayKey,
} from "../checklist-model.js";

const here = dirname(fileURLToPath(import.meta.url));
const daily = join(here, "..");
const repo = join(daily, "..");
const plan = JSON.parse(readFileSync(join(daily, "plans.json"), "utf8"));
const parsed = parsePlan(plan);

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

test("plans.json is the valid single plan", () => {
  assert.equal(parsed.ok, true, parsed.errors?.join(","));
  assert.equal(parsed.plan.children.cam.firstName, "Cam");
  assert.equal(parsed.plan.children.christian.firstName, "Christian");
  assert.equal(parsed.plan.children.cam.presentation, "compact");
  assert.equal(parsed.plan.children.christian.presentation, "guided");
  const nov12 = parsed.plan.days["2026-11-12"];
  assert.equal(nov12.status, "preparing");
  assert.equal(nov12.message, "Your plan is being prepared.");
  assert.deepEqual(nov12.tasks, []);
  assert.equal(Object.values(parsed.plan.days).every((day) => day.status === "preparing"), true);
  assert.equal(parsed.plan.sample.tasks.length >= 3, true);
  for (const task of parsed.plan.sample.tasks) {
    assert.equal(task.steps.length >= 1, true);
    assert.equal(task.finishedMeans.length > 0, true);
    assert.equal(/\b(Cam|Christian)\b/.test(JSON.stringify(task)), false);
  }
});

test("sample tasks never fill a real date", () => {
  const nov12 = getDayContent(parsed.plan, "plan", "2026-11-12");
  const today = getDayContent(parsed.plan, "plan", "2026-11-07");
  const preview = getDayContent(parsed.plan, "preview", "2026-11-12");
  assert.equal(nov12.phase, "preparing");
  assert.equal(nov12.message, "Your plan is being prepared.");
  assert.equal(today.phase, "preparing");
  assert.equal(today.message, USER_COPY.preparingDefault);
  assert.deepEqual(nov12.tasks, []);
  assert.equal(preview.phase, "tasks");
  assert.equal(preview.dateKey, "sample");
  assert.equal(preview.tasks.some((task) => task.id === "sample-read-card"), true);
  assert.match(preview.banner, /not a real assignment/i);
});

test("each page uses that child's plan and falls back to the shared day", () => {
  const rawNov12 = plan.days.find((day) => day.date === "2026-11-12");
  assert.deepEqual(rawNov12, {
    date: "2026-11-12",
    status: "preparing",
    message: "Your plan is being prepared.",
  });
  assert.deepEqual(plan.sample.tasks.map((task) => task.id), [
    "sample-read-card",
    "sample-three-sentences",
    "sample-count-six",
  ]);

  for (const child of ["cam", "christian"]) {
    const nov12 = getDayContent(parsed.plan, "plan", "2026-11-12", child);
    assert.equal(nov12.phase, "preparing");
    assert.equal(nov12.message, "Your plan is being prepared.");
    assert.deepEqual(nov12.tasks, []);
  }

  const cam13 = getDayContent(parsed.plan, "plan", "2026-11-13", "cam");
  assert.equal(cam13.phase, "tasks");
  assert.deepEqual(cam13.tasks.map((task) => task.title), [
    "Finish script planning for your woods movie",
    "Word puzzles: rebus puzzles, pages 1-5",
    "Cursive practice",
    "Optional: help set up the new laptop",
  ]);
  assert.equal(cam13.tasks.length, 4);
  assert.equal(/case|Cracked Tablet|Rune Stone|Salt and Gold|case-files/i.test(JSON.stringify(cam13)), false);
  assert.equal(JSON.stringify(cam13).includes(".pdf"), false);
  assert.equal(/\b(Christian|zoo|grandpa|sanctuary)\b|food truck|food-truck|Thanksgiving/i.test(JSON.stringify(cam13)), false);

  const christian13 = getDayContent(parsed.plan, "plan", "2026-11-13", "christian");
  assert.equal(christian13.phase, "tasks");
  assert.deepEqual(christian13.tasks.map((task) => task.title), [
    "Finish your zoo vs. sanctuary paragraph",
    "Finish your grandpa interview sheet",
    "Today's shift: Food Truck Shift 3: The Register Crashed",
    "Algebra review: Review Shift: Hold the Rounding",
    "Optional: Thanksgiving budget, Worksheet A Steps 1-3",
  ]);
  const budget = christian13.tasks[4];
  assert.deepEqual(budget.materials, []);
  assert.match(budget.instruction, /scale the recipes for 6/);
  assert.match(budget.instruction, /convert units/);
  assert.match(budget.instruction, /first estimate vs\. the \$50 target/);
  assert.equal(christian13.tasks[2].materials[0].href, "https://dawnclay2011-ui.github.io/family-games/food-truck/day3/");
  assert.equal(christian13.tasks[3].materials[0].href, "https://dawnclay2011-ui.github.io/family-games/food-truck/review/");
  assert.match(christian13.tasks[3].instruction, /six problems with hints/);
  assert.match(christian13.tasks[3].instruction, /Round only at the end/);
  assert.match(christian13.tasks[3].instruction, /Send the report to Mom when it clears/);
  const christianText = JSON.stringify(christian13);
  assert.equal(/\bCam\b|woods movie|rebus|cursive|Mesopotamia|laptop|case-files/i.test(christianText), false);
  assert.equal(/\b(answer|score|overdue|behind)\b|\blate\b/i.test(`${christianText}\n${JSON.stringify(cam13)}`), false);
  assert.equal(getDayContent(parsed.plan, "plan", "2026-11-13").phase, "preparing");

  const movieDays = {
    "2026-11-14": {
      movie: /prep for filming/,
      title: "Today's case: Daily Case #11: The Missing Script Page",
      href: "https://dawnclay2011-ui.github.io/family-games/case-files/day11/",
      short: true,
    },
    "2026-11-15": {
      movie: /Ouabache/,
      title: "Today's case: Daily Case #12: The Shot List Mix-Up",
      href: "https://dawnclay2011-ui.github.io/family-games/case-files/day12/",
      short: true,
    },
    "2026-11-16": {
      movie: /\bedit\b/,
      title: "Today's case: Daily Case #13: Tracks in the Mud",
      href: "https://dawnclay2011-ui.github.io/family-games/case-files/day13/",
      short: false,
    },
    "2026-11-17": {
      movie: /\bedit\b/,
      title: "Today's case: Daily Case #14: The Old Park Mystery",
      href: "https://dawnclay2011-ui.github.io/family-games/case-files/day14/",
      short: true,
    },
    "2026-11-18": {
      movie: /premiere/,
      title: "Today's case: Daily Case #15: Premiere Night",
      href: "https://dawnclay2011-ui.github.io/family-games/case-files/day15/",
      short: false,
    },
  };
  for (const [date, expected] of Object.entries(movieDays)) {
    const cam = getDayContent(parsed.plan, "plan", date, "cam");
    const christian = getDayContent(parsed.plan, "plan", date, "christian");
    assert.equal(cam.tasks.length, 2, date);
    assert.equal(cam.tasks[0].title, "Woods movie: today's step");
    assert.match(cam.tasks[0].instruction, expected.movie);
    assert.equal(cam.tasks[1].title, expected.title);
    assert.equal(cam.tasks[1].materials[0].href, expected.href);
    assert.equal(/short case/.test(cam.tasks[1].instruction), expected.short, date);
    assert.equal(christian.phase, "preparing", date);
    assert.equal(christian.message, "Your plan is being prepared.");
    assert.deepEqual(christian.tasks, []);
    assert.equal(/\bChristian\b|case files/i.test(JSON.stringify(cam.tasks)), false);
  }

  const previewChristian = getDayContent(parsed.plan, "preview", "2026-11-13", "christian");
  assert.equal(previewChristian.dateKey, "sample");
  assert.equal(previewChristian.tasks[0].id, "sample-read-card");

  const sharedReady = structuredClone(plan);
  sharedReady.days.push({
    date: "2026-11-21",
    status: "ready",
    tasks: [parsed.plan.sample.tasks[0]],
    children: {
      christian: { status: "preparing", message: "Your plan is being prepared." },
    },
  });
  const readyParsed = parsePlan(sharedReady);
  assert.equal(readyParsed.ok, true, readyParsed.errors?.join(","));
  assert.equal(getDayContent(readyParsed.plan, "plan", "2026-11-21", "cam").tasks[0].id, "sample-read-card");
  assert.equal(getDayContent(readyParsed.plan, "plan", "2026-11-21").tasks[0].id, "sample-read-card");
  assert.equal(getDayContent(readyParsed.plan, "plan", "2026-11-21", "christian").phase, "preparing");
  assert.equal(getDayContent(readyParsed.plan, "plan", "2026-11-21", "christian").message, "Your plan is being prepared.");
});

test("storage is separated by child, date, and task version", () => {
  assert.notEqual(storageKey("cam", "plan"), storageKey("christian", "plan"));
  assert.notEqual(storageKey("cam", "plan"), storageKey("cam", "preview"));
  let record = emptyRecord();
  record = setMark(record, { dateKey: "2026-11-01", taskId: "copy-lines", version: 1, mark: "done", nowIso: "t1" });
  record = setNote(record, { dateKey: "2026-11-01", note: "kept from earlier" });
  const untouched = JSON.parse(JSON.stringify(record));
  record = setMark(record, { dateKey: "2026-11-02", taskId: "copy-lines", version: 1, mark: "help", nowIso: "t2" });
  record = setMark(record, { dateKey: "2026-11-01", taskId: "copy-lines", version: 2, mark: "open", nowIso: "t3" });
  assert.equal(getMark(record, "2026-11-01", "copy-lines", 1), "done");
  assert.equal(getMark(record, "2026-11-01", "copy-lines", 2), "open");
  assert.equal(getMark(record, "2026-11-02", "copy-lines", 1), "help");
  assert.equal(getMark(record, "2026-11-03", "copy-lines", 1), "open");
  assert.equal(getNote(record, "2026-11-01"), "kept from earlier");
  assert.equal(getNote(record, "2026-11-02"), "");
  assert.equal(untouched.days["2026-11-01"].tasks["copy-lines"]["1"].mark, "done");
  const round = loadRecord(JSON.stringify(record));
  assert.equal(round.readOnly, false);
  assert.equal(getMark(round.record, "2026-11-01", "copy-lines", 1), "done");
});

test("unreadable saves are not treated as checks", () => {
  assert.equal(loadRecord(null).readOnly, false);
  assert.equal(loadRecord("{").readOnly, true);
  assert.deepEqual(loadRecord("{").record, emptyRecord());
  const future = loadRecord(JSON.stringify({ schemaVersion: 2, days: { "2026-11-01": { note: "keep" } } }));
  assert.equal(future.readOnly, true);
  assert.equal(getNote(future.record, "2026-11-01"), "");
});

test("summary lists only what was marked", () => {
  const summary = buildSummary({
    firstName: "Christian",
    heading: "Sample day",
    banner: parsed.plan.sample.banner,
    phase: "tasks",
    summaryLead: parsed.plan.presentations.guided.summaryLead,
    emptyFinished: parsed.plan.presentations.guided.emptyFinished,
    note: "The last count was tricky.",
    tasks: [
      { title: "Read the sample card out loud", mark: "done" },
      { title: "Write three sentences", mark: "open" },
      { title: "Count six objects", mark: "help" },
    ],
  });
  assert.match(summary, /^Christian\nSample day/);
  assert.match(summary, /Christian, here is what you marked/);
  assert.match(summary, /You marked finished:\n- Read the sample card out loud/);
  assert.match(summary, /Still on your list:\n- Write three sentences/);
  assert.match(summary, /You asked for help:\n- Count six objects/);
  assert.match(summary, /Your note:\nThe last count was tricky\./);
  assert.equal(summary.includes("You marked every task"), false);
  assert.equal(summary.includes("Mom received"), false);
  const preparing = buildSummary({
    firstName: "Cam",
    heading: "Thursday, November 12, 2026",
    phase: "preparing",
    preparingMessage: "Your plan is being prepared.",
    preparingExtra: parsed.plan.presentations.compact.preparingExtra,
    note: "   ",
    tasks: [{ title: "Read the sample card out loud", mark: "done" }],
  });
  assert.match(preparing, /Your plan is being prepared\./);
  assert.equal(preparing.includes("Read the sample card"), false);
  assert.equal(preparing.includes("You marked finished"), false);
  const allDone = buildSummary({
    firstName: "Cam",
    heading: "Sample day",
    phase: "tasks",
    summaryLead: "here is what you marked for this day.",
    emptyFinished: "You have not marked anything finished yet.",
    note: "",
    tasks: [{ title: "Count six objects", mark: "done" }],
  });
  assert.match(allDone, /You marked every task on this list finished\./);
});

test("share payload has no address and no delivery claim", async () => {
  const text = "Christian\nSample day\nYour note:\nwindow-sill-note-9421";
  const payload = buildSharePayload({ firstName: "Christian", mode: "preview", text });
  assert.deepEqual(Object.keys(payload), ["title", "text"]);
  assert.equal(payload.url, undefined);
  assert.match(payload.text, /window-sill-note-9421/);
  assert.match(messageForShare("opened"), /^Sharing options opened\./);
  assert.equal(/Mom received|was delivered/i.test(messageForShare("opened")), false);
  assert.match(messageForShare("cancelled"), /still here/);
  assert.match(messageForShare("failed"), /Copy summary/);
  assert.match(messageForShare("unsupported"), /Copy summary/);
  assert.match(messageForCopy("blocked"), /select it and copy/);

  let seen;
  assert.equal((await runSend({
    share: async (data) => { seen = data; },
    title: payload.title,
    text: payload.text,
  })).outcome, "opened");
  assert.equal(seen.url, undefined);
  const abort = new Error("nope");
  abort.name = "AbortError";
  assert.equal((await runSend({ share: async () => { throw abort; }, title: "t", text: "x" })).outcome, "cancelled");
  assert.equal((await runSend({ share: async () => { throw new Error("down"); }, title: "t", text: "x" })).outcome, "failed");
  const missing = new Error("no share");
  missing.name = "UnsupportedError";
  assert.equal((await runSend({ share: async () => { throw missing; }, title: "t", text: "x" })).outcome, "unsupported");
  assert.equal((await runSend({ share: null, title: "t", text: "x" })).outcome, "unsupported");
  let copied = "";
  assert.equal((await runCopy({ clipboard: { writeText: async (value) => { copied = value; } }, text: "hello" })).outcome, "copied");
  assert.equal(copied, "hello");
  assert.equal((await runCopy({ clipboard: { writeText: async () => { throw new Error("denied"); } }, text: "hello" })).outcome, "blocked");
  assert.equal((await runCopy({ clipboard: null, text: "hello" })).outcome, "blocked");
});

test("material links stay on safe web addresses", () => {
  const base = "https://example.test/family-games/daily/plans.json";
  const good = resolveMaterials([
    { label: "Packet", href: "https://example.com/packet.pdf" },
    { label: "Card", href: "sample-reading.html" },
    { label: "Nested", href: "materials/packet.pdf" },
  ], base);
  assert.deepEqual(good.kept.map((item) => item.href), [
    "https://example.com/packet.pdf",
    "https://example.test/family-games/daily/sample-reading.html",
    "https://example.test/family-games/daily/materials/packet.pdf",
  ]);
  const bad = [
    "javascript:alert(1)",
    "data:text/html,hi",
    "mailto:person@example.com",
    "tel:15555550123",
    "//evil.example/a",
    "../cam/index.html",
    "/christian/",
    "https://user:pass@example.com/a",
    "http://example.com/a b",
  ];
  for (const href of bad) {
    const result = resolveMaterials([{ label: "Nope", href }], base);
    assert.equal(result.kept.length, 0, href);
    assert.equal(result.dropped, 1, href);
  }
});

test("bad plans are rejected instead of shown", () => {
  const withTasks = structuredClone(plan);
  withTasks.days[0].tasks = parsed.plan.sample.tasks;
  assert.equal(parsePlan(withTasks).ok, false);
  assert.equal(parsePlan(withTasks).errors.includes("preparing_has_tasks"), true);

  const sneaky = structuredClone(plan);
  sneaky.presentations.guided.pageLead = "This one is easier.";
  assert.equal(parsePlan(sneaky).errors.includes("presentation_label"), true);

  const link = structuredClone(plan);
  link.sample.materials[0].href = "javascript:alert(1)";
  assert.equal(parsePlan(link).errors.includes("material_href"), true);

  const unknown = structuredClone(plan);
  unknown.days[0].children = { alex: { status: "preparing" } };
  assert.equal(parsePlan(unknown).errors.includes("child_day"), true);

  const childTasks = structuredClone(plan);
  childTasks.days.push({
    date: "2026-11-20",
    status: "preparing",
    message: "Your plan is being prepared.",
    children: { cam: { status: "preparing", tasks: parsed.plan.sample.tasks } },
  });
  assert.equal(parsePlan(childTasks).errors.includes("preparing_has_tasks"), true);
});

test("local dates do not shift through UTC", () => {
  assert.equal(todayKey(new Date(2026, 10, 7, 23, 30)), "2026-11-07");
  assert.equal(todayKey(new Date(2026, 10, 12, 0, 30)), "2026-11-12");
  assert.match(formatDateHeading("2026-11-12"), /Thursday, November 12, 2026/);
});

test("pages and scripts do not publish private or sibling routes", () => {
  const cam = readFileSync(join(daily, "cam/index.html"), "utf8");
  const christian = readFileSync(join(daily, "christian/index.html"), "utf8");
  const previewCam = readFileSync(join(daily, "preview/cam/index.html"), "utf8");
  const previewChristian = readFileSync(join(daily, "preview/christian/index.html"), "utf8");
  assert.match(cam, /data-child="cam"/);
  assert.match(christian, /data-child="christian"/);
  assert.equal(/\bChristian\b/.test(cam + previewCam), false);
  assert.equal(/\bCam\b/.test(christian + previewChristian), false);
  assert.match(previewCam, /data-mode="preview"/);
  assert.match(previewChristian, /data-mode="preview"/);
  for (const html of [cam, christian, previewCam, previewChristian]) {
    assert.equal(html.includes("href=\"/"), false);
    assert.equal(html.includes("src=\"/"), false);
    assert.match(html, /form-action 'none'/);
  }
  const rootIndex = readFileSync(join(repo, "index.html"), "utf8");
  assert.equal(rootIndex.includes("daily"), false);
  const js = readFileSync(join(daily, "checklist.js"), "utf8");
  const model = readFileSync(join(daily, "checklist-model.js"), "utf8");
  assert.equal((js.match(/fetch\(/g) || []).length, 1);
  assert.match(js, /fetch\(options\.plansUrl/);
  assert.equal(/console\.(log|debug|info|warn|error|trace)\s*\(/.test(js + model), false);
  assert.equal(/location\.(search|hash)\s*=|history\.pushState|sendBeacon|XMLHttpRequest|formsubmit|mailto:|MOM_EMAIL/.test(js + model), false);
});

test("committed checklist copy stays free of private and unapproved topic text", () => {
  const files = walk(daily).filter((path) => !relative(daily, path).startsWith("test"));
  const visible = files.filter((path) => /\.(html|css|json|md)$/.test(path));
  const text = visible.map((path) => readFileSync(path, "utf8")).join("\n");
  const copy = Object.values(USER_COPY).join("\n");
  const shown = `${text}\n${copy}`;
  const withoutDisclaimer = shown.replaceAll("not a grade", "");
  assert.equal(/grade/i.test(withoutDisclaimer), false);
  const banned = [
    /formsubmit/i,
    /mailto:/i,
    /tel:/i,
    /javascript:/i,
    /sendBeacon/,
    /google-analytics/i,
    /gtag\(/,
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    /\b\d{3}[-.)]\d{3}[-.]\d{4}\b/,
    /\b(custody|birthdate|birth date|adhd|dyslexia|autism|iep)\b/i,
    /\bscore\b/i,
  ];
  for (const pattern of banned) assert.equal(pattern.test(shown), false, String(pattern));
  const topic = /\b(easier|harder|younger|older|overdue|zoo)\b|food truck|food-truck|tycoon|case files/i;
  const chromeText = visible
    .filter((path) => relative(daily, path) !== "plans.json")
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  assert.equal(topic.test(chromeText), false);
  assert.equal(topic.test(JSON.stringify(plan.sample)), false);
  assert.equal(topic.test(JSON.stringify(plan.presentations)), false);
  for (const day of plan.days) {
    const shared = {
      date: day.date,
      status: day.status,
      message: day.message,
      tasks: day.tasks,
      materials: day.materials,
    };
    assert.equal(topic.test(JSON.stringify(shared)), false, day.date);
    if (day.children?.cam) assert.equal(topic.test(JSON.stringify(day.children.cam)), false, `${day.date} cam`);
    if (day.date === "2026-11-13") {
      assert.match(JSON.stringify(day.children.christian), /\bzoo\b/);
      assert.match(JSON.stringify(day.children.christian), /food-truck/);
    } else {
      assert.equal(day.children?.christian, undefined, day.date);
    }
  }
  assert.match(readFileSync(join(daily, "README.md"), "utf8"), /schemaVersion/);
  assert.match(readFileSync(join(daily, "README.md"), "utf8"), /finishedMeans/);
  assert.match(readFileSync(join(daily, "README.md"), "utf8"), /plans\.json/);
});

test("memory storage can save and withhold", () => {
  const storage = createMemoryStorage();
  assert.equal(storage.read("missing"), null);
  storage.write("daily-checklist:v1:cam", "{\"schemaVersion\":1,\"days\":{}}");
  assert.match(storage.read("daily-checklist:v1:cam"), /schemaVersion/);
  storage.remove("daily-checklist:v1:cam");
  assert.equal(storage.read("daily-checklist:v1:cam"), null);
});
