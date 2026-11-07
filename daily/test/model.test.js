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
  assert.equal(Object.values(parsed.plan.days).some((day) => day.status === "ready"), false);
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
    /\b(easier|harder|younger|older|overdue|zoo)\b/i,
    /food truck|food-truck|tycoon|case files/i,
    /\b(custody|birthdate|birth date|adhd|dyslexia|autism|iep)\b/i,
    /\bscore\b/i,
  ];
  for (const pattern of banned) assert.equal(pattern.test(shown), false, String(pattern));
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
