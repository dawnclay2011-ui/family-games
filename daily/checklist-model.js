/**
 * Pure rules for the daily checklist.
 * Tasks come only from plans.json. Checks stay in a record the page can store
 * on the device. This file does not read the network, the DOM, or the console.
 */

export const USER_COPY = {
  disclaimer: "Checks are what you mark yourself. They are not a grade.",
  selfReport: "These checks are what you mark yourself. They are not a grade.",
  summaryClosing: "This page does not send this summary. You choose whether to share it.",
  storage:
    "Your checks and note are saved in this browser only, on this device. They are not uploaded, and they do not appear on another phone. This link is not a password. If the page is on a public website, anyone with the link can open it, but they will not see your checks or note.",
  offline:
    "Refreshing this page loads it again when your browser can reach the files or already has them saved. Your saved checks come back with the page if storage is allowed. If you are offline, a new visit works only when the browser still has the files. This page does not sync later.",
  dateHelp:
    "This page opens on today's date. Choose another date to see what you marked then. Days you leave unfinished stay as they were. They are not added to a later day.",
  sendHelp:
    "Send to Mom opens this device's share sheet when the browser has one, so you can choose the app and the person, then press Send there. This page does not send by itself.",
  copyHelp:
    "Copy summary puts the words on the clipboard when the browser allows it. Then you paste them into the app you choose.",
  noteHint: "Stays on this device unless you choose to share it. Up to 280 characters.",
  preparingDefault: "Your plan is being prepared.",
  storageBlocked:
    "This browser is not saving checks on this device. If you refresh or leave, they will be gone. Nothing is uploaded.",
  storageUnreadable:
    "Saved checks on this device could not be read. You can start again on this visit. New checks will not replace the unreadable save. Nothing was uploaded.",
  planBroken: "The lesson plan file needs a correction before it can be shown. Nothing was uploaded.",
  planMissing:
    "The lesson plan could not be loaded. Nothing was uploaded. Refresh when you are online to try the file again.",
  notSetUp: "This checklist page is not set up.",
  offlineNow:
    "You appear to be offline. Checks stay on this device either way. A refresh may fail if the browser does not still have the page files.",
  previewDate: "Sample day. This preview is not a calendar date and not a real assignment.",
  shareOpened:
    "Sharing options opened. You still choose the app and press Send there. This page cannot tell if anyone received it.",
  shareCancelled: "Sharing was cancelled. Your checks are still here.",
  shareFailed: "The share sheet did not open. Use Copy summary. Your checks are still here.",
  shareUnsupported:
    "This browser cannot open a share sheet. Use Copy summary, then paste it into the app you choose. Your checks are still here.",
  copyDone: "Summary copied. Paste it into the app you choose, pick who gets it, and press Send there.",
  copyBlocked:
    "Copy is blocked here. The summary is in the box below so you can select it and copy. Your checks are still here.",
  droppedLink: "A material link was left off because it was not a safe web address.",
  allMarked: "You marked every task on this list finished.",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PRESENTATION_FIELDS = [
  "pageLead",
  "stepsIntro",
  "finishedHeading",
  "doneLabel",
  "doneHint",
  "helpLabel",
  "noteLabel",
  "summaryLead",
  "emptyFinished",
  "preparingExtra",
];
const PRESENTATION_BANNED = /\b(easier|harder|younger|older|advanced|overdue|grade|score|points)\b/i;

export function isValidDateKey(value) {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function todayKey(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateHeading(dateKey) {
  if (!isValidDateKey(dateKey)) return dateKey;
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

export function storageKey(childId, mode) {
  const suffix = mode === "preview" ? ":preview" : "";
  return `daily-checklist:v1:${childId}${suffix}`;
}

export function emptyRecord() {
  return { schemaVersion: 1, days: {} };
}

function cloneRecord(record) {
  const days = {};
  for (const [dateKey, day] of Object.entries(record?.days || {})) {
    const tasks = {};
    for (const [taskId, versions] of Object.entries(day.tasks || {})) {
      tasks[taskId] = {};
      for (const [version, entry] of Object.entries(versions || {})) {
        tasks[taskId][version] = { mark: entry.mark, updatedAt: entry.updatedAt };
      }
    }
    days[dateKey] = { note: day.note || "", tasks };
  }
  return { schemaVersion: 1, days };
}

function sanitizeDay(day) {
  const note = typeof day?.note === "string" ? day.note.slice(0, 280) : "";
  const tasks = {};
  if (!day?.tasks || typeof day.tasks !== "object" || Array.isArray(day.tasks)) {
    return { note, tasks };
  }
  for (const [taskId, versions] of Object.entries(day.tasks)) {
    if (!ID_RE.test(taskId) || !versions || typeof versions !== "object" || Array.isArray(versions)) continue;
    const clean = {};
    for (const [version, entry] of Object.entries(versions)) {
      if (!/^[1-9][0-9]{0,2}$/.test(version)) continue;
      const mark = entry?.mark === "done" || entry?.mark === "help" ? entry.mark : "open";
      const updatedAt = typeof entry?.updatedAt === "string" ? entry.updatedAt.slice(0, 40) : "";
      clean[version] = { mark, updatedAt };
    }
    if (Object.keys(clean).length) tasks[taskId] = clean;
  }
  return { note, tasks };
}

export function loadRecord(raw) {
  if (raw == null || raw === "") return { record: emptyRecord(), readOnly: false };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { record: emptyRecord(), readOnly: true };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || parsed.schemaVersion !== 1) {
    return { record: emptyRecord(), readOnly: true };
  }
  const days = {};
  if (parsed.days && typeof parsed.days === "object" && !Array.isArray(parsed.days)) {
    for (const [dateKey, day] of Object.entries(parsed.days)) {
      if (!isValidDateKey(dateKey) && dateKey !== "sample") continue;
      days[dateKey] = sanitizeDay(day);
    }
  }
  return { record: { schemaVersion: 1, days }, readOnly: false };
}

export function serializeRecord(record) {
  return JSON.stringify(record);
}

export function getMark(record, dateKey, taskId, version) {
  const mark = record?.days?.[dateKey]?.tasks?.[taskId]?.[String(version)]?.mark;
  return mark === "done" || mark === "help" ? mark : "open";
}

export function getNote(record, dateKey) {
  return record?.days?.[dateKey]?.note || "";
}

function dayKeyOk(dateKey) {
  return dateKey === "sample" || isValidDateKey(dateKey);
}

export function setMark(record, { dateKey, taskId, version, mark, nowIso }) {
  if (!dayKeyOk(dateKey)) throw new Error("bad date");
  if (!ID_RE.test(taskId)) throw new Error("bad task");
  if (!Number.isInteger(version) || version < 1 || version > 999) throw new Error("bad version");
  if (mark !== "done" && mark !== "help" && mark !== "open") throw new Error("bad mark");
  const next = cloneRecord(record);
  const day = next.days[dateKey] || { note: "", tasks: {} };
  const versions = { ...(day.tasks[taskId] || {}) };
  versions[String(version)] = { mark, updatedAt: typeof nowIso === "string" ? nowIso : "" };
  day.tasks[taskId] = versions;
  next.days[dateKey] = day;
  return next;
}

export function setNote(record, { dateKey, note }) {
  if (!dayKeyOk(dateKey)) throw new Error("bad date");
  const next = cloneRecord(record);
  const day = next.days[dateKey] || { note: "", tasks: {} };
  day.note = String(note ?? "").slice(0, 280);
  next.days[dateKey] = day;
  return next;
}

function pushError(errors, code) {
  if (!errors.includes(code)) errors.push(code);
}

function readText(value, max, errors, code) {
  if (typeof value !== "string") {
    pushError(errors, code);
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
    pushError(errors, code);
    return "";
  }
  return trimmed;
}

function hrefProblem(href) {
  if (typeof href !== "string") return true;
  const trimmed = href.trim();
  if (!trimmed || trimmed.length > 500 || /[\s<>"']/.test(trimmed)) return true;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (url.protocol !== "http:" && url.protocol !== "https:") return true;
      if (url.username || url.password) return true;
    } catch {
      return true;
    }
    return false;
  }
  if (trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\")) return true;
  if (trimmed.split("/").includes("..")) return true;
  return false;
}

function readMaterials(list, errors) {
  if (list == null) return [];
  if (!Array.isArray(list)) {
    pushError(errors, "materials");
    return [];
  }
  if (list.length > 6) pushError(errors, "materials");
  return list.map((item) => {
    const label = readText(item?.label, 80, errors, "material_label");
    if (hrefProblem(item?.href)) pushError(errors, "material_href");
    return { label, href: typeof item?.href === "string" ? item.href.trim() : "" };
  });
}

function readTask(task, errors) {
  const id = readText(task?.id, 40, errors, "task_id");
  if (id && !ID_RE.test(id)) pushError(errors, "task_id");
  const version = task?.version;
  if (!Number.isInteger(version) || version < 1 || version > 999) pushError(errors, "task_version");
  const title = readText(task?.title, 120, errors, "task_title");
  const instruction = readText(task?.instruction, 500, errors, "task_instruction");
  const finishedMeans = readText(task?.finishedMeans, 300, errors, "task_finished");
  if (!Array.isArray(task?.steps) || task.steps.length < 1 || task.steps.length > 8) {
    pushError(errors, "task_steps");
  }
  const steps = Array.isArray(task?.steps) ? task.steps.map((step) => readText(step, 200, errors, "task_steps")) : [];
  const materials = readMaterials(task?.materials, errors);
  return {
    id,
    version: Number.isInteger(version) ? version : 0,
    title,
    instruction,
    steps,
    finishedMeans,
    materials,
  };
}

function readTasks(list, errors) {
  if (!Array.isArray(list) || list.length < 1 || list.length > 12) {
    pushError(errors, "tasks");
    return [];
  }
  const tasks = list.map((task) => readTask(task, errors));
  const ids = new Set();
  for (const task of tasks) {
    if (!task.id) continue;
    if (ids.has(task.id)) pushError(errors, "duplicate_task");
    ids.add(task.id);
  }
  return tasks;
}

function readChildEntry(entry, errors) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    pushError(errors, "child_day");
    return { status: "", heading: null, message: null, materials: [], tasks: [] };
  }
  const status = entry.status;
  if (status !== "preparing" && status !== "ready") pushError(errors, "child_day_status");
  const heading = entry.heading == null ? null : readText(entry.heading, 80, errors, "day_heading");
  const message = entry.message == null ? null : readText(entry.message, 180, errors, "day_message");
  if (status === "preparing") {
    if (Object.prototype.hasOwnProperty.call(entry, "tasks")) pushError(errors, "preparing_has_tasks");
    if (Object.prototype.hasOwnProperty.call(entry, "materials")) pushError(errors, "preparing_has_materials");
    return { status: "preparing", heading, message, materials: [], tasks: [] };
  }
  if (status === "ready") {
    return {
      status: "ready",
      heading,
      message,
      materials: readMaterials(entry.materials, errors),
      tasks: readTasks(entry.tasks, errors),
    };
  }
  return { status: "", heading, message, materials: [], tasks: [] };
}

function readDayChildren(day, errors) {
  if (!Object.prototype.hasOwnProperty.call(day, "children")) return {};
  const source = day.children;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    pushError(errors, "child_day");
    return {};
  }
  const children = {};
  for (const id of Object.keys(source)) {
    if (id !== "cam" && id !== "christian") {
      pushError(errors, "child_day");
      continue;
    }
    children[id] = readChildEntry(source[id], errors);
  }
  return children;
}

function readPresentation(value, errors) {
  const presentation = { id: "" };
  for (const field of PRESENTATION_FIELDS) {
    presentation[field] = readText(value?.[field], 240, errors, "presentation");
    if (presentation[field] && PRESENTATION_BANNED.test(presentation[field])) {
      pushError(errors, "presentation_label");
    }
  }
  return presentation;
}

export function parsePlan(data) {
  const errors = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, errors: ["plan_not_object"] };
  }
  if (data.schemaVersion !== 1) pushError(errors, "schema_version");
  const childIds = data.children && typeof data.children === "object" ? Object.keys(data.children).sort() : [];
  if (childIds.join(",") !== "cam,christian") pushError(errors, "children");

  const presentationsIn = data.presentations;
  if (!presentationsIn || typeof presentationsIn !== "object" || Array.isArray(presentationsIn)) {
    pushError(errors, "presentation");
  }
  const presentations = {};
  for (const key of ["compact", "guided"]) {
    presentations[key] = readPresentation(presentationsIn?.[key], errors);
    presentations[key].id = key;
  }

  const children = {};
  for (const id of ["cam", "christian"]) {
    const source = data.children?.[id] || {};
    const firstName = readText(source.firstName, 20, errors, "child_name");
    if (firstName && !/^[A-Za-z]+$/.test(firstName)) pushError(errors, "child_name");
    const presentation = source.presentation;
    if (presentation !== "compact" && presentation !== "guided") pushError(errors, "presentation_missing");
    children[id] = {
      id,
      firstName,
      presentation: presentation === "compact" || presentation === "guided" ? presentation : "",
    };
  }

  if (!Array.isArray(data.days)) pushError(errors, "days_type");
  const days = {};
  const seen = new Set();
  for (const day of Array.isArray(data.days) ? data.days : []) {
    const date = day?.date;
    if (!isValidDateKey(date)) {
      pushError(errors, "day_date");
      continue;
    }
    if (seen.has(date)) pushError(errors, "duplicate_date");
    seen.add(date);
    const status = day?.status;
    if (status !== "preparing" && status !== "ready") pushError(errors, "day_status");
    const heading = day?.heading == null ? null : readText(day.heading, 80, errors, "day_heading");
    const message = day?.message == null ? null : readText(day.message, 180, errors, "day_message");
    const childPlans = readDayChildren(day, errors);
    if (status === "preparing") {
      if (Object.prototype.hasOwnProperty.call(day, "tasks")) pushError(errors, "preparing_has_tasks");
      if (Object.prototype.hasOwnProperty.call(day, "materials")) pushError(errors, "preparing_has_materials");
      days[date] = { date, status: "preparing", heading, message, materials: [], tasks: [], children: childPlans };
    } else if (status === "ready") {
      days[date] = {
        date,
        status: "ready",
        heading,
        message,
        materials: readMaterials(day.materials, errors),
        tasks: readTasks(day.tasks, errors),
        children: childPlans,
      };
    }
  }

  if (!data.sample || typeof data.sample !== "object" || Array.isArray(data.sample)) {
    pushError(errors, "sample_missing");
  }
  const sample = {
    dateKey: "sample",
    heading: readText(data.sample?.heading, 80, errors, "sample"),
    banner: readText(data.sample?.banner, 240, errors, "sample"),
    materials: readMaterials(data.sample?.materials, errors),
    tasks: readTasks(data.sample?.tasks, errors),
  };
  if (data.sample?.banner && !/example|sample|not a real/i.test(data.sample.banner)) {
    pushError(errors, "sample_banner");
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], plan: { schemaVersion: 1, children, presentations, days, sample } };
}

export function getDayContent(plan, mode, dateKey, childId) {
  if (mode === "preview") {
    return {
      phase: "tasks",
      dateKey: "sample",
      heading: plan.sample.heading,
      banner: plan.sample.banner,
      materials: plan.sample.materials,
      tasks: plan.sample.tasks,
      message: null,
    };
  }
  const day = plan.days?.[dateKey];
  const own = childId && day?.children && Object.prototype.hasOwnProperty.call(day.children, childId)
    ? day.children[childId]
    : null;
  const source = own || day;
  if (!source || source.status !== "ready") {
    return {
      phase: "preparing",
      dateKey,
      heading: source?.heading || day?.heading || null,
      banner: null,
      materials: [],
      tasks: [],
      message: (own && own.message) || day?.message || USER_COPY.preparingDefault,
    };
  }
  return {
    phase: "tasks",
    dateKey,
    heading: source.heading || day?.heading || null,
    banner: null,
    materials: source.materials || [],
    tasks: source.tasks,
    message: null,
  };
}

export function resolveMaterials(materials, planFileUrl) {
  const kept = [];
  let dropped = 0;
  let base;
  try {
    base = new URL("./", planFileUrl);
  } catch {
    return { kept: [], dropped: Array.isArray(materials) ? materials.length : 0 };
  }
  for (const item of materials || []) {
    if (!item || hrefProblem(item.href) || !item.label) {
      dropped += 1;
      continue;
    }
    try {
      const url = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(item.href) ? new URL(item.href) : new URL(item.href, base);
      if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
        dropped += 1;
        continue;
      }
      kept.push({ label: item.label, href: url.href });
    } catch {
      dropped += 1;
    }
  }
  return { kept, dropped };
}

export function buildSummary(input) {
  const lines = [input.firstName, input.heading];
  if (input.banner) lines.push("", input.banner);
  lines.push("");
  if (input.phase === "preparing") {
    lines.push(input.preparingMessage);
    if (input.preparingExtra) lines.push(input.preparingExtra);
    lines.push("");
  } else {
    lines.push(`${input.firstName}, ${input.summaryLead}`);
  }
  lines.push(USER_COPY.selfReport);
  lines.push("");
  if (input.phase === "tasks") {
    const tasks = input.tasks || [];
    const finished = tasks.filter((task) => task.mark === "done");
    const help = tasks.filter((task) => task.mark === "help");
    const open = tasks.filter((task) => task.mark !== "done" && task.mark !== "help");
    if (finished.length === 0) {
      lines.push(input.emptyFinished);
    } else {
      lines.push("You marked finished:");
      for (const task of finished) lines.push(`- ${task.title}`);
      if (finished.length === tasks.length && tasks.length > 0) lines.push(USER_COPY.allMarked);
    }
    if (open.length) {
      lines.push("", "Still on your list:");
      for (const task of open) lines.push(`- ${task.title}`);
    }
    if (help.length) {
      lines.push("", "You asked for help:");
      for (const task of help) lines.push(`- ${task.title}`);
    }
    lines.push("");
  }
  const note = String(input.note || "").trim();
  if (note) lines.push("Your note:", note, "");
  lines.push(USER_COPY.summaryClosing);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

export function buildSharePayload({ firstName, mode, text }) {
  const title = mode === "preview"
    ? `Preview sample — ${firstName}'s daily checklist`
    : `${firstName}'s daily checklist`;
  return { title, text };
}

export async function runSend({ share, title, text }) {
  if (typeof share !== "function") return { outcome: "unsupported" };
  try {
    await share({ title, text });
    return { outcome: "opened" };
  } catch (error) {
    const name = error && error.name;
    if (name === "AbortError") return { outcome: "cancelled" };
    if (name === "UnsupportedError") return { outcome: "unsupported" };
    return { outcome: "failed" };
  }
}

export async function runCopy({ clipboard, text }) {
  try {
    if (!clipboard || typeof clipboard.writeText !== "function") return { outcome: "blocked" };
    await clipboard.writeText(text);
    return { outcome: "copied" };
  } catch {
    return { outcome: "blocked" };
  }
}

export function messageForShare(outcome) {
  if (outcome === "opened") return USER_COPY.shareOpened;
  if (outcome === "cancelled") return USER_COPY.shareCancelled;
  if (outcome === "failed") return USER_COPY.shareFailed;
  return USER_COPY.shareUnsupported;
}

export function messageForCopy(outcome) {
  return outcome === "copied" ? USER_COPY.copyDone : USER_COPY.copyBlocked;
}

export function createMemoryStorage() {
  const map = new Map();
  return {
    read(key) {
      return map.has(key) ? map.get(key) : null;
    },
    write(key, value) {
      map.set(key, String(value));
    },
    remove(key) {
      map.delete(key);
    },
  };
}

export function createThrowingStorage() {
  const error = () => {
    const denied = new Error("storage denied");
    denied.name = "SecurityError";
    throw denied;
  };
  return { read: error, write: error, remove: error };
}

export function createBrowserStorage(store = globalThis.localStorage) {
  return {
    read(key) {
      return store.getItem(key);
    },
    write(key, value) {
      store.setItem(key, value);
    },
    remove(key) {
      store.removeItem(key);
    },
  };
}
