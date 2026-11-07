/**
 * Mobile checklist page. Tasks come from plans.json.
 * Checks and the optional note stay in memory and, when the browser allows,
 * in local storage for this child and mode. Nothing is posted to a server.
 */

import {
  USER_COPY,
  buildSharePayload,
  buildSummary,
  createBrowserStorage,
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
  serializeRecord,
  setMark,
  setNote,
  storageKey,
  todayKey,
  isValidDateKey,
} from "./checklist-model.js";

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = String(value);
    else if (key === "dataset" && value && typeof value === "object") Object.assign(node.dataset, value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

function storageWorks(storage) {
  const probe = "__daily_checklist_probe__";
  try {
    storage.write(probe, "ok");
    const value = storage.read(probe);
    try {
      storage.remove?.(probe);
    } catch {
      /* The save itself worked. A stuck probe key holds no checklist text. */
    }
    return value === "ok";
  } catch {
    return false;
  }
}

function defaultShare(payload) {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    const error = new Error("share unavailable");
    error.name = "UnsupportedError";
    throw error;
  }
  return navigator.share(payload);
}

function badgeText(mark) {
  if (mark === "done") return "Marked finished";
  if (mark === "help") return "Needs help";
  return "Not marked yet";
}

export async function createChecklistApp(container, options = {}) {
  const mode = options.mode === "preview" ? "preview" : "plan";
  const childId = options.childId;
  const now = options.now || (() => new Date());
  const storage = options.storage || createBrowserStorage();
  const share = options.share === undefined ? defaultShare : options.share;
  const clipboard = options.clipboard === undefined ? navigator.clipboard : options.clipboard;
  const online = options.online || (() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const ac = new AbortController();
  const key = storageKey(childId, mode);

  let record = emptyRecord();
  let storageBlocked = false;
  let readOnly = false;
  let dateKey = mode === "preview" ? "sample" : todayKey(now());
  let plan = null;
  let planFileUrl = options.plansUrl || "";
  let child = null;
  let presentation = null;
  let summaryNode = null;
  let liveNode = null;
  let storageBanner = null;
  let offlineBanner = null;
  let noteInput = null;
  let fallbackBox = null;
  let sendButton = null;
  let copyButton = null;

  function showLive(message) {
    if (!liveNode) return;
    liveNode.textContent = message || "";
  }

  function showStorageBanner(message) {
    if (!storageBanner) return;
    if (!message) {
      storageBanner.hidden = true;
      storageBanner.textContent = "";
      return;
    }
    storageBanner.hidden = false;
    storageBanner.textContent = message;
  }

  function summaryInput() {
    const content = getDayContent(plan, mode, dateKey);
    const heading = content.heading || formatDateHeading(content.dateKey);
    return {
      firstName: child.firstName,
      heading,
      banner: content.banner,
      phase: content.phase,
      preparingMessage: content.message || USER_COPY.preparingDefault,
      preparingExtra: content.phase === "preparing" ? presentation.preparingExtra : "",
      summaryLead: presentation.summaryLead,
      emptyFinished: presentation.emptyFinished,
      note: getNote(record, content.dateKey),
      tasks: content.tasks.map((task) => ({
        title: task.title,
        mark: getMark(record, content.dateKey, task.id, task.version),
      })),
    };
  }

  function currentSummary() {
    return buildSummary(summaryInput());
  }

  function paintSummary() {
    const text = currentSummary();
    if (summaryNode) summaryNode.textContent = text;
    return text;
  }

  function persist() {
    if (storageBlocked || readOnly) return false;
    try {
      storage.write(key, serializeRecord(record));
      return true;
    } catch {
      storageBlocked = true;
      showStorageBanner(USER_COPY.storageBlocked);
      return false;
    }
  }

  function stamp() {
    try {
      return now().toISOString();
    } catch {
      return "";
    }
  }

  function applyMark(task, mark) {
    record = setMark(record, {
      dateKey: getDayContent(plan, mode, dateKey).dateKey,
      taskId: task.id,
      version: task.version,
      mark,
      nowIso: stamp(),
    });
    persist();
    paintSummary();
  }

  function renderMaterials(host, materials) {
    host.replaceChildren();
    const resolved = resolveMaterials(materials, planFileUrl);
    if (!resolved.kept.length && !resolved.dropped) {
      host.hidden = true;
      return;
    }
    host.hidden = false;
    const heading = el("h2", { text: "Lesson materials" });
    const list = el("ul", { class: "materials" });
    for (const item of resolved.kept) {
      const link = el("a", {
        href: item.href,
        target: "_blank",
        rel: "noopener noreferrer",
        referrerpolicy: "no-referrer",
      }, [item.label, el("span", { class: "sr-only", text: " (opens in a new tab)" })]);
      list.append(el("li", {}, [link]));
    }
    host.append(heading, list);
    if (resolved.dropped) host.append(el("p", { class: "hint", text: USER_COPY.droppedLink }));
  }

  function renderTask(task, contentDate) {
    const mark = getMark(record, contentDate, task.id, task.version);
    const finishedId = `finished-${task.id}`;
    const doneId = `done-${task.id}`;
    const helpId = `help-${task.id}`;
    const badge = el("p", { class: "badge", dataset: { badge: "true" }, text: badgeText(mark) });
    const doneInput = el("input", { type: "checkbox", id: doneId, "aria-describedby": finishedId });
    const helpInput = el("input", { type: "checkbox", id: helpId, "aria-describedby": finishedId });
    doneInput.checked = mark === "done";
    helpInput.checked = mark === "help";

    function syncBadge(next) {
      badge.textContent = badgeText(next);
      badge.dataset.state = next;
      article.dataset.mark = next;
    }

    doneInput.addEventListener("change", () => {
      if (doneInput.checked) helpInput.checked = false;
      const next = doneInput.checked ? "done" : helpInput.checked ? "help" : "open";
      syncBadge(next);
      applyMark(task, next);
    });
    helpInput.addEventListener("change", () => {
      if (helpInput.checked) doneInput.checked = false;
      const next = helpInput.checked ? "help" : doneInput.checked ? "done" : "open";
      syncBadge(next);
      applyMark(task, next);
    });

    const article = el("article", { class: "task", id: `task-${task.id}`, dataset: { mark, taskId: task.id, version: String(task.version) } }, [
      el("h3", { text: task.title }),
      el("p", { class: "instruction", text: task.instruction }),
      el("p", { class: "steps-intro", text: presentation.stepsIntro }),
      el("ol", { class: "steps" }, task.steps.map((step) => el("li", { text: step }))),
      el("p", { class: "finished", id: finishedId }, [
        el("span", { class: "finished-heading", text: presentation.finishedHeading }),
        task.finishedMeans,
      ]),
      el("p", { class: "done-hint", text: presentation.doneHint }),
      el("fieldset", {}, [
        el("legend", { text: "Your check-in" }),
        el("label", { class: "choice done" }, [doneInput, el("span", { text: presentation.doneLabel })]),
        el("label", { class: "choice help" }, [helpInput, el("span", { text: presentation.helpLabel })]),
      ]),
      badge,
    ]);
    return article;
  }

  function renderDay() {
    const content = getDayContent(plan, mode, dateKey);
    const activeDate = content.dateKey;
    const heading = content.heading || formatDateHeading(activeDate);
    container.querySelector("#day-heading").textContent = heading;
    const banner = container.querySelector("#preview-banner");
    if (content.banner) {
      banner.hidden = false;
      banner.textContent = content.banner;
    } else {
      banner.hidden = true;
      banner.textContent = "";
    }
    renderMaterials(container.querySelector("#materials"), content.materials);
    const checklist = container.querySelector("#checklist");
    checklist.replaceChildren(el("h2", { id: "checklist-heading", text: "Checklist" }));
    if (content.phase === "preparing") {
      checklist.append(
        el("div", { class: "preparing", id: "plan-message" }, [
          el("p", { class: "preparing-title", text: content.message || USER_COPY.preparingDefault }),
          el("p", { text: presentation.preparingExtra }),
        ]),
      );
    } else {
      for (const task of content.tasks) checklist.append(renderTask(task, activeDate));
    }
    if (noteInput && noteInput.value !== getNote(record, activeDate)) {
      noteInput.value = getNote(record, activeDate);
    }
    paintSummary();
    container.dataset.state = content.phase;
  }

  function paintReady() {
    document.documentElement.dataset.presentation = presentation.id;
    document.documentElement.dataset.mode = mode;
    container.dataset.child = child.id;
    container.dataset.mode = mode;
    container.dataset.ready = "true";
    container.setAttribute("aria-busy", "false");

    const showDate = mode === "plan";
    const dateBlock = showDate
      ? el("div", { class: "date-block" }, [
          el("label", { for: "day-input", text: "Choose a date" }),
          el("input", { id: "day-input", type: "date", value: dateKey }),
          el("p", { id: "day-heading", class: "day-heading", text: "" }),
          el("p", { class: "hint", text: USER_COPY.dateHelp }),
        ])
      : el("div", { class: "date-block" }, [
          el("p", { id: "day-heading", class: "day-heading", text: "" }),
          el("p", { class: "hint", text: USER_COPY.previewDate }),
        ]);

    summaryNode = el("div", { id: "summary-text", class: "summary-text", tabindex: "0" });
    liveNode = el("p", { id: "live-status", class: "live", role: "status", "aria-live": "polite" });
    storageBanner = el("p", {
      id: "storage-banner",
      class: "banner warning",
      role: "status",
      "aria-live": "polite",
      hidden: true,
    });
    offlineBanner = el("p", {
      id: "offline-banner",
      class: "banner warning",
      role: "status",
      "aria-live": "polite",
      hidden: true,
    });
    noteInput = el("textarea", {
      id: "child-note",
      maxlength: "280",
      rows: "3",
      "aria-describedby": "note-hint",
      autocomplete: "off",
      spellcheck: "true",
    });
    fallbackBox = el("textarea", {
      id: "selectable-fallback",
      class: "selectable",
      readonly: true,
      rows: "8",
      hidden: true,
      "aria-label": "Summary to select and copy",
    });
    sendButton = el("button", { type: "button", id: "send-mom", class: "primary", "aria-describedby": "send-help" }, [
      "Send to Mom",
    ]);
    copyButton = el("button", { type: "button", id: "copy-summary", class: "secondary", "aria-describedby": "copy-help" }, [
      "Copy summary",
    ]);

    const h1 = mode === "preview"
      ? `Preview sample for ${child.firstName}`
      : `${child.firstName}'s daily checklist`;
    const eyebrow = mode === "preview" ? "Not a real assignment" : "Daily checklist";

    container.replaceChildren(
      el("header", { class: "mast" }, [
        el("p", { class: "eyebrow", text: eyebrow }),
        el("h1", { text: h1 }),
        el("p", { class: "lead", text: presentation.pageLead }),
        el("p", { class: "disclaimer", text: USER_COPY.disclaimer }),
      ]),
      storageBanner,
      offlineBanner,
      el("p", { id: "preview-banner", class: "banner", hidden: true }),
      dateBlock,
      el("section", { id: "materials", hidden: true }),
      el("section", { id: "checklist", "aria-labelledby": "checklist-heading" }),
      el("section", { class: "summary", "aria-labelledby": "summary-heading" }, [
        el("h2", { id: "summary-heading", text: "Your summary" }),
        summaryNode,
      ]),
      el("div", { class: "note-block" }, [
        el("label", { for: "child-note", text: presentation.noteLabel }),
        noteInput,
        el("p", { id: "note-hint", class: "hint", text: USER_COPY.noteHint }),
      ]),
      el("div", { class: "actions" }, [
        sendButton,
        el("p", { id: "send-help", class: "hint", text: USER_COPY.sendHelp }),
        copyButton,
        el("p", { id: "copy-help", class: "hint", text: USER_COPY.copyHelp }),
        fallbackBox,
        liveNode,
      ]),
      el("footer", { class: "caveat" }, [
        el("p", { text: USER_COPY.storage }),
        el("p", { text: USER_COPY.offline }),
      ]),
    );

    const dateInput = container.querySelector("#day-input");
    if (dateInput) {
      dateInput.addEventListener("change", () => {
        if (!isValidDateKey(dateInput.value)) return;
        dateKey = dateInput.value;
        renderDay();
      }, { signal: ac.signal });
    }
    noteInput.addEventListener("input", () => {
      const active = getDayContent(plan, mode, dateKey).dateKey;
      record = setNote(record, { dateKey: active, note: noteInput.value });
      persist();
      paintSummary();
      fallbackBox.hidden = true;
    }, { signal: ac.signal });

    sendButton.addEventListener("click", async () => {
      const text = paintSummary();
      const payload = buildSharePayload({ firstName: child.firstName, mode, text });
      const result = await runSend({ share, title: payload.title, text: payload.text });
      showLive(messageForShare(result.outcome));
      if (result.outcome === "unsupported" || result.outcome === "failed") copyButton.focus();
    }, { signal: ac.signal });

    copyButton.addEventListener("click", async () => {
      const text = paintSummary();
      const result = await runCopy({ clipboard, text });
      showLive(messageForCopy(result.outcome));
      if (result.outcome === "blocked") {
        fallbackBox.hidden = false;
        fallbackBox.value = text;
        fallbackBox.focus();
        fallbackBox.select();
      } else {
        fallbackBox.hidden = true;
      }
    }, { signal: ac.signal });

    if (storageBlocked) showStorageBanner(USER_COPY.storageBlocked);
    else if (readOnly) showStorageBanner(USER_COPY.storageUnreadable);
    if (!online()) offlineBanner.hidden = false;
    if (!offlineBanner.hidden) offlineBanner.textContent = USER_COPY.offlineNow;

    window.addEventListener("offline", () => {
      offlineBanner.hidden = false;
      offlineBanner.textContent = USER_COPY.offlineNow;
    }, { signal: ac.signal });
    window.addEventListener("online", () => {
      offlineBanner.hidden = true;
      offlineBanner.textContent = "";
    }, { signal: ac.signal });

    renderDay();
  }

  function paintStop(message, state) {
    container.replaceChildren(
      el("h1", { text: "Daily checklist" }),
      el("p", { class: "banner warning", role: "alert", text: message }),
    );
    container.dataset.ready = "true";
    container.dataset.state = state;
    container.setAttribute("aria-busy", "false");
  }

  try {
    if (!/^[a-z]{1,20}$/.test(childId || "")) {
      paintStop(USER_COPY.notSetUp, "error");
      return api();
    }
    storageBlocked = !storageWorks(storage);
    if (!storageBlocked) {
      try {
        const loaded = loadRecord(storage.read(key));
        record = loaded.record;
        readOnly = loaded.readOnly;
      } catch {
        storageBlocked = true;
        record = emptyRecord();
      }
    }

    if (options.plan) {
      const parsed = parsePlan(options.plan);
      if (!parsed.ok) {
        paintStop(USER_COPY.planBroken, "error");
        return api();
      }
      plan = parsed.plan;
      planFileUrl = options.plansUrl || planFileUrl;
    } else if (options.plansUrl) {
      let response;
      try {
        response = await fetch(options.plansUrl, { cache: "no-store" });
      } catch {
        paintStop(USER_COPY.planMissing, "error");
        return api();
      }
      if (!response.ok) {
        paintStop(USER_COPY.planMissing, "error");
        return api();
      }
      planFileUrl = response.url || new URL(options.plansUrl, window.location.href).href;
      let json;
      try {
        json = await response.json();
      } catch {
        paintStop(USER_COPY.planBroken, "error");
        return api();
      }
      const parsed = parsePlan(json);
      if (!parsed.ok) {
        paintStop(USER_COPY.planBroken, "error");
        return api();
      }
      plan = parsed.plan;
    } else {
      paintStop(USER_COPY.planMissing, "error");
      return api();
    }

    child = plan.children[childId];
    presentation = child ? plan.presentations[child.presentation] : null;
    if (!child || !presentation) {
      paintStop(USER_COPY.notSetUp, "error");
      return api();
    }
    paintReady();
  } catch {
    paintStop(USER_COPY.planMissing, "error");
  }

  function api() {
    return {
      destroy() {
        ac.abort();
      },
      getState() {
        return {
          record,
          dateKey: mode === "preview" ? "sample" : dateKey,
          storageBlocked,
          readOnly,
          summaryText: plan && child ? currentSummary() : "",
        };
      },
    };
  }
  return api();
}

const bootRoot = document.querySelector("#app");
if (bootRoot?.dataset.child && bootRoot.dataset.boot !== "off") {
  createChecklistApp(bootRoot, {
    childId: bootRoot.dataset.child,
    mode: bootRoot.dataset.mode || "plan",
    plansUrl: bootRoot.dataset.plans,
  });
}
