window.addEventListener("error", (event) => {
  const out = document.querySelector("#out");
  const root = document.querySelector("#app");
  if (out) out.textContent = `HARNESS_FAIL\n${event.message}`;
  if (root) root.dataset.ready = "true";
});
window.addEventListener("unhandledrejection", (event) => {
  const out = document.querySelector("#out");
  const root = document.querySelector("#app");
  if (out) out.textContent = `HARNESS_FAIL\n${event.reason}`;
  if (root) root.dataset.ready = "true";
});

import { createChecklistApp } from "../checklist.js";
import {
  createMemoryStorage,
  createThrowingStorage,
  storageKey,
  USER_COPY,
} from "../checklist-model.js";

const logs = [];
for (const method of ["log", "info", "debug", "warn", "error"]) {
  console[method] = (...args) => {
    logs.push(args.map((item) => String(item)).join(" "));
  };
}

const failures = [];
function check(name, condition) {
  if (!condition) failures.push(name);
}

const real = await (await fetch("../plans.json", { cache: "no-store" })).json();
const slots = document.querySelector("#slots");
const plansUrl = new URL("../plans.json", location.href).href;
const sampleTitles = ["Read the sample card out loud", "Write three sentences", "Count six objects"];

function task(id, version, title) {
  return {
    id,
    version,
    title,
    instruction: `Follow the steps for ${title}.`,
    steps: ["Read the direction.", "Do it on paper."],
    finishedMeans: `${title} is finished on the paper.`,
  };
}

function fixturePlan() {
  return {
    schemaVersion: 1,
    children: real.children,
    presentations: real.presentations,
    sample: real.sample,
    days: [
      { date: "2026-11-01", status: "ready", tasks: [task("copy-lines", 2, "Copy two lines")] },
      {
        date: "2026-11-02",
        status: "ready",
        tasks: [task("copy-lines", 2, "Copy two lines"), task("fold-square", 1, "Fold a paper square")],
      },
    ],
  };
}

async function mount(options) {
  const host = document.createElement("section");
  slots.append(host);
  const app = await createChecklistApp(host, { plansUrl, ...options });
  return { host, app };
}

function text(host) {
  return host.innerText;
}

const calls = { share: 0 };
const quiet = await mount({
  childId: "christian",
  mode: "preview",
  plan: real,
  storage: createMemoryStorage(),
  share: async () => { calls.share += 1; },
  clipboard: { writeText: async () => {} },
  now: () => new Date(2026, 10, 7, 9, 0, 0),
});
check("share is not called just by opening the page", calls.share === 0);
check("preview banner is visible", text(quiet.host).includes("not a real assignment"));
check("preview shows sample tasks", sampleTitles.every((title) => text(quiet.host).includes(title)));
check("preview has no date field", quiet.host.querySelector("#day-input") == null);
check("guided steps and finished line are visible", text(quiet.host).includes("Do these steps in order") && text(quiet.host).includes("This is finished when"));
check("guided checkbox names the finished steps", text(quiet.host).includes("I finished every step"));
check("Christian preview does not name Cam", !/\bCam\b/.test(text(quiet.host)));
check("send button is present", quiet.host.querySelector("#send-mom")?.textContent === "Send to Mom");
check("one main heading", quiet.host.querySelectorAll("h1").length === 1);

const boxes = [...quiet.host.querySelectorAll("input[type=checkbox]")];
check("checkboxes have names and finished descriptions", boxes.every((input) => {
  const label = input.closest("label");
  return label && label.textContent.trim().length > 8 && input.getAttribute("aria-describedby") && input.tabIndex >= 0;
}));
const order = [...quiet.host.querySelectorAll("a, button, input, textarea")].map((node) => node.id).filter(Boolean);
check("keyboard order reaches checks, note, send, and copy", order.indexOf("done-sample-read-card") < order.indexOf("help-sample-read-card")
  && order.indexOf("help-sample-count-six") < order.indexOf("child-note")
  && order.indexOf("child-note") < order.indexOf("send-mom")
  && order.indexOf("send-mom") < order.indexOf("copy-summary"));

quiet.host.querySelector("#done-sample-read-card").click();
quiet.host.querySelector("#help-sample-count-six").click();
const note = quiet.host.querySelector("#child-note");
note.value = "window-sill-note-9421";
note.dispatchEvent(new Event("input", { bubbles: true }));
const summary = quiet.host.querySelector("#summary-text").textContent;
check("summary matches the visible self-report", summary === quiet.app.getState().summaryText);
check("summary includes the marked task only as finished", summary.includes("You marked finished:\n- Read the sample card out loud"));
check("summary does not call the open task finished", !summary.includes("You marked finished:\n- Write three sentences"));
check("summary includes help and the note", summary.includes("You asked for help:\n- Count six objects") && summary.includes("window-sill-note-9421"));
check("note is not in the address", !location.search.includes("window-sill-note") && !location.hash.includes("window-sill-note") && location.search === "" && location.hash === "");
check("note is not written to the console", !logs.join("\n").includes("window-sill-note-9421"));
check("done and help stay exclusive", quiet.host.querySelector("#done-sample-count-six").checked === false && quiet.host.querySelector("#help-sample-count-six").checked === true);

let openedPayload = null;
const opened = await mount({
  childId: "christian",
  mode: "preview",
  plan: real,
  storage: createMemoryStorage(),
  share: async (payload) => { openedPayload = payload; },
  clipboard: { writeText: async () => {} },
});
opened.host.querySelector("#done-sample-three-sentences").click();
opened.host.querySelector("#child-note").value = "window-sill-note-9421";
opened.host.querySelector("#child-note").dispatchEvent(new Event("input", { bubbles: true }));
const beforeOpen = opened.host.querySelector("#done-sample-three-sentences").checked;
opened.host.querySelector("#send-mom").click();
await new Promise((resolve) => setTimeout(resolve, 0));
check("opened share uses the summary and no url", openedPayload && openedPayload.url == null && openedPayload.text.includes("window-sill-note-9421") && Object.keys(openedPayload).every((key) => key === "title" || key === "text"));
check("opened share does not claim delivery", opened.host.querySelector("#live-status").textContent.startsWith("Sharing options opened.") && !opened.host.querySelector("#live-status").textContent.includes("Mom received"));
check("opened share keeps the check", opened.host.querySelector("#done-sample-three-sentences").checked === beforeOpen);

async function shareCase(share, expectation) {
  const view = await mount({
    childId: "cam",
    mode: "preview",
    plan: real,
    storage: createMemoryStorage(),
    share,
    clipboard: { writeText: async () => {} },
  });
  view.host.querySelector("#done-sample-read-card").click();
  view.host.querySelector("#send-mom").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  check(expectation, view.host.querySelector("#live-status").textContent.includes(expectation) && view.host.querySelector("#done-sample-read-card").checked);
}
const abort = new Error("cancel");
abort.name = "AbortError";
await shareCase(async () => { throw abort; }, "Sharing was cancelled");
await shareCase(async () => { throw new Error("down"); }, "The share sheet did not open");
await shareCase(null, "This browser cannot open a share sheet");

const blockedCopy = await mount({
  childId: "cam",
  mode: "preview",
  plan: real,
  storage: createMemoryStorage(),
  share: async () => {},
  clipboard: { writeText: async () => { throw new Error("denied"); } },
});
blockedCopy.host.querySelector("#help-sample-three-sentences").click();
blockedCopy.host.querySelector("#child-note").value = "clipboard-note-55";
blockedCopy.host.querySelector("#child-note").dispatchEvent(new Event("input", { bubbles: true }));
blockedCopy.host.querySelector("#copy-summary").click();
await new Promise((resolve) => setTimeout(resolve, 0));
const fallback = blockedCopy.host.querySelector("#selectable-fallback");
check("blocked clipboard shows selectable summary", fallback && !fallback.hidden && fallback.value.includes("clipboard-note-55") && fallback.value.includes("Write three sentences"));
check("blocked clipboard keeps the help mark", blockedCopy.host.querySelector("#help-sample-three-sentences").checked);
check("blocked copy message is visible", blockedCopy.host.querySelector("#live-status").textContent.includes("Copy is blocked"));

const saved = createMemoryStorage();
const first = await mount({
  childId: "christian",
  mode: "plan",
  plan: fixturePlan(),
  storage: saved,
  now: () => new Date(2026, 10, 2, 8, 0, 0),
  share: null,
  clipboard: null,
});
check("fresh visit does not invent a finished task", first.host.querySelector("#done-copy-lines").checked === false);
check("opening does not need a save before a tap", saved.read(storageKey("christian", "plan")) == null);
first.host.querySelector("#day-input").value = "2026-11-01";
first.host.querySelector("#day-input").dispatchEvent(new Event("change", { bubbles: true }));
first.host.querySelector("#help-copy-lines").click();
first.host.querySelector("#child-note").value = "left from the first day";
first.host.querySelector("#child-note").dispatchEvent(new Event("input", { bubbles: true }));
first.host.querySelector("#day-input").value = "2026-11-02";
first.host.querySelector("#day-input").dispatchEvent(new Event("change", { bubbles: true }));
check("the next day does not inherit the earlier help mark", first.host.querySelector("#help-copy-lines").checked === false && first.host.querySelector("#done-copy-lines").checked === false);
first.host.querySelector("#done-fold-square").click();
first.host.querySelector("#day-input").value = "2026-11-01";
first.host.querySelector("#day-input").dispatchEvent(new Event("change", { bubbles: true }));
check("returning to the earlier day keeps its note and help mark", first.host.querySelector("#help-copy-lines").checked && first.host.querySelector("#child-note").value === "left from the first day");
check("the later day's check is still stored", first.app.getState().record.days["2026-11-02"].tasks["fold-square"]["1"].mark === "done");
first.app.destroy();

const second = await mount({
  childId: "christian",
  mode: "plan",
  plan: fixturePlan(),
  storage: saved,
  now: () => new Date(2026, 10, 1, 8, 0, 0),
  share: null,
  clipboard: null,
});
second.host.querySelector("#day-input").value = "2026-11-01";
second.host.querySelector("#day-input").dispatchEvent(new Event("change", { bubbles: true }));
check("reload restores the earlier day", second.host.querySelector("#help-copy-lines").checked && second.host.querySelector("#child-note").value === "left from the first day");

const versioned = createMemoryStorage();
versioned.write(storageKey("cam", "plan"), JSON.stringify({
  schemaVersion: 1,
  days: { "2026-11-02": { note: "", tasks: { "copy-lines": { "1": { mark: "done", updatedAt: "t0" } } } } },
}));
const versionView = await mount({
  childId: "cam",
  mode: "plan",
  plan: fixturePlan(),
  storage: versioned,
  now: () => new Date(2026, 10, 2, 8, 0, 0),
  share: null,
  clipboard: null,
});
check("a new task version starts unmarked", versionView.host.querySelector("#done-copy-lines").checked === false);
versionView.host.querySelector("#done-copy-lines").click();
const storedVersions = JSON.parse(versioned.read(storageKey("cam", "plan"))).days["2026-11-02"].tasks["copy-lines"];
check("the old version remains beside the new one", storedVersions["1"].mark === "done" && storedVersions["2"].mark === "done");

const shared = createMemoryStorage();
const cam = await mount({
  childId: "cam",
  mode: "plan",
  plan: fixturePlan(),
  storage: shared,
  now: () => new Date(2026, 10, 2, 8, 0, 0),
  share: null,
  clipboard: null,
});
const christian = await mount({
  childId: "christian",
  mode: "plan",
  plan: fixturePlan(),
  storage: shared,
  now: () => new Date(2026, 10, 2, 8, 0, 0),
  share: null,
  clipboard: null,
});
cam.host.querySelector("#done-fold-square").click();
check("Christian does not see Cam's check", christian.host.querySelector("#done-fold-square").checked === false);
check("Cam's page does not name Christian", !/\bChristian\b/.test(text(cam.host)));
check("Christian's page does not name Cam", !/\bCam\b/.test(text(christian.host)));
check("compact wording is Cam's", text(cam.host).includes("Finished means") && text(cam.host).includes("I finished this") && !text(cam.host).includes("I finished every step"));
check("saves use different keys", shared.read(storageKey("cam", "plan")) && !shared.read(storageKey("christian", "plan")));

const previewStore = createMemoryStorage();
const previewCam = await mount({
  childId: "cam",
  mode: "preview",
  plan: real,
  storage: previewStore,
  share: null,
  clipboard: null,
});
previewCam.host.querySelector("#done-sample-read-card").click();
const planCam = await mount({
  childId: "cam",
  mode: "plan",
  plan: real,
  storage: previewStore,
  now: () => new Date(2026, 10, 12, 8, 0, 0),
  share: null,
  clipboard: null,
});
check("real November 12 does not show sample tasks", sampleTitles.every((title) => !text(planCam.host).includes(title)));
check("November 12 says the plan is being prepared", text(planCam.host).includes("Your plan is being prepared."));
check("preview save is not the real-day save", previewStore.read(storageKey("cam", "preview")) && !previewStore.read(storageKey("cam", "plan")));

const denied = await mount({
  childId: "christian",
  mode: "preview",
  plan: real,
  storage: createThrowingStorage(),
  share: null,
  clipboard: null,
});
check("blocked storage is explained", text(denied.host).includes(USER_COPY.storageBlocked));
denied.host.querySelector("#done-sample-read-card").click();
check("blocked storage still accepts a check for this visit", denied.host.querySelector("#done-sample-read-card").checked);
const deniedAgain = await mount({
  childId: "christian",
  mode: "preview",
  plan: real,
  storage: createThrowingStorage(),
  share: null,
  clipboard: null,
});
check("a new visit cannot recover blocked checks", deniedAgain.host.querySelector("#done-sample-read-card").checked === false);

let writesAfterLoad = 0;
const rawKeep = JSON.stringify({ schemaVersion: 2, days: { "2026-11-07": { note: "keep-me-unreadable" } } });
const guarded = {
  read(key) {
    if (key === "__daily_checklist_probe__") return "ok";
    return rawKeep;
  },
  write(key, value) {
    if (key === "__daily_checklist_probe__") return;
    writesAfterLoad += 1;
    throw new Error(`unexpected write ${value}`);
  },
  remove() {},
};
const guardedView = await mount({
  childId: "cam",
  mode: "preview",
  plan: real,
  storage: guarded,
  share: null,
  clipboard: null,
});
guardedView.host.querySelector("#done-sample-read-card").click();
check("an unreadable save is not overwritten", writesAfterLoad === 0 && text(guardedView.host).includes(USER_COPY.storageUnreadable));

const offline = await mount({
  childId: "cam",
  mode: "plan",
  plan: real,
  storage: createMemoryStorage(),
  online: () => false,
  now: () => new Date(2026, 10, 7, 8, 0, 0),
  share: null,
  clipboard: null,
});
check("offline state is described", text(offline.host).includes(USER_COPY.offlineNow) && text(offline.host).includes("does not sync later"));
window.dispatchEvent(new Event("online"));
check("coming back online clears the temporary offline line", offline.host.querySelector("#offline-banner").hidden);
check("the standing offline explanation remains", text(offline.host).includes("does not sync later"));

const card = previewCam.host.querySelector("#materials a");
check("sample card resolves next to the plan file", card?.href.endsWith("/daily/sample-reading.html") === true);

const camToday = await mount({
  childId: "cam",
  mode: "plan",
  plan: real,
  storage: createMemoryStorage(),
  now: () => new Date(2026, 10, 13, 9, 0, 0),
  share: null,
  clipboard: null,
});
const camTodayText = text(camToday.host);
check("Cam's November 13 list is his own", [
  "Finish script planning for your woods movie",
  "Word puzzles: rebus puzzles, pages 1-5",
  "Cursive practice",
  "Optional: help set up the new laptop",
].every((line) => camTodayText.includes(line)));
check("Cam November 13 has no case task", !/case|Cracked Tablet|Rune Stone|Salt and Gold/i.test(camTodayText) && ![...camToday.host.querySelectorAll("a")].some((anchor) => anchor.href.includes("/case-files/")));
check("Cam does not see Christian's November 13 work", !/Christian|zoo vs|Food Truck|Thanksgiving|grandpa/i.test(camTodayText));

const christianToday = await mount({
  childId: "christian",
  mode: "plan",
  plan: real,
  storage: createMemoryStorage(),
  now: () => new Date(2026, 10, 13, 9, 0, 0),
  share: null,
  clipboard: null,
});
const christianTodayText = text(christianToday.host);
check("Christian's November 13 list is his own", [
  "Finish your zoo vs. sanctuary paragraph",
  "Finish your grandpa interview sheet",
  "Food Truck Shift 3: The Register Crashed",
  "Optional: Thanksgiving budget, Worksheet A Steps 1-3",
  "scale the recipes for 6",
  "$50 target",
].every((line) => christianTodayText.includes(line)));
check("the budget task has no link", christianToday.host.querySelector("#task-thanksgiving-budget a") == null);
check("Christian's shift link is present", [...christianToday.host.querySelectorAll("#checklist a")].some((anchor) => anchor.href.includes("/food-truck/day3/")));
check("Christian does not see Cam's November 13 work", !/\bCam\b|woods movie|rebus|Cursive practice|Rune Stone|Salt and Gold|new laptop|case-files/.test(christianTodayText));
christianToday.host.querySelector("#day-input").value = "2026-11-14";
christianToday.host.querySelector("#day-input").dispatchEvent(new Event("change", { bubbles: true }));
check("Christian November 14 is still being prepared", text(christianToday.host).includes("Your plan is being prepared.") && !text(christianToday.host).includes("Woods movie"));
camToday.host.querySelector("#day-input").value = "2026-11-14";
camToday.host.querySelector("#day-input").dispatchEvent(new Event("change", { bubbles: true }));
check("Cam November 14 is only the woods movie step", text(camToday.host).includes("Woods movie: today's step") && text(camToday.host).includes("prep for filming") && !text(camToday.host).includes("rebus"));
check("no form is added", document.querySelector("form") == null);

document.querySelector("#app").dataset.ready = "true";
document.querySelector("#out").textContent = failures.length
  ? `HARNESS_FAIL\n${failures.join("\n")}`
  : "HARNESS_PASS";
