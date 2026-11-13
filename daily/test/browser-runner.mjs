import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const repo = normalize(join(import.meta.dirname, "..", ".."));
const artifacts = "/opt/cursor/artifacts";
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".png": "image/png",
};

function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      let pathname = decodeURIComponent(url.pathname);
      let file = normalize(join(repo, pathname));
      if (!file.startsWith(repo)) {
        res.writeHead(403).end("no");
        return;
      }
      let info;
      try { info = await stat(file); } catch {
        res.writeHead(404).end("missing");
        return;
      }
      if (info.isDirectory()) {
        if (!pathname.endsWith("/")) {
          res.writeHead(302, { location: `${pathname}/` }).end();
          return;
        }
        file = join(file, "index.html");
      }
      const body = await readFile(file);
      res.writeHead(200, {
        "content-type": types[extname(file)] || "application/octet-stream",
        "cache-control": "no-store",
      });
      res.end(body);
    } catch {
      res.writeHead(500).end("error");
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function waitFor(fn, label) {
  let last = "";
  for (let i = 0; i < 80; i += 1) {
    try {
      const value = await fn();
      if (value) return value;
      last = "empty";
    } catch (error) {
      last = error.message || String(error);
    }
    await delay(100);
  }
  throw new Error(`timed out waiting for ${label}: ${last}`);
}

function connect(url) {
  const ws = new WebSocket(url);
  const pending = new Map();
  let seq = 0;
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
  });
  return new Promise((resolve, reject) => {
    ws.addEventListener("open", () => {
      resolve({
        send(method, params = {}, sessionId) {
          const id = ++seq;
          const payload = { id, method, params };
          if (sessionId) payload.sessionId = sessionId;
          ws.send(JSON.stringify(payload));
          return new Promise((ok, no) => pending.set(id, { resolve: ok, reject: no }));
        },
        close() { ws.close(); },
      });
    });
    ws.addEventListener("error", () => reject(new Error("chrome websocket failed")));
  });
}

async function main() {
  const failures = [];
  const server = await startServer();
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const debugPort = 9400 + Math.floor(Math.random() * 400);
  const chrome = spawn("google-chrome", [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=/tmp/daily-checklist-chrome-${debugPort}`,
    "about:blank",
  ], { stdio: "ignore" });

  try {
    const version = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (!response.ok) return null;
      return response.json();
    }, "chrome");
    const cdp = await connect(version.webSocketDebuggerUrl);
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Runtime.enable", {}, sessionId);

    async function evaluate(expression) {
      const result = await cdp.send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      }, sessionId);
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text || "evaluate failed");
      }
      return result.result?.value;
    }

    async function open(url, width, height, mobile) {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 1,
        mobile,
      }, sessionId);
      await cdp.send("Page.navigate", { url }, sessionId);
      await waitFor(async () => evaluate(`(() => {
        const app = document.querySelector("#app");
        if (app && app.dataset.child) return app.dataset.ready === "true" ? true : null;
        const out = document.querySelector("#out");
        if (out) {
          const text = out.textContent || "";
          return text.startsWith("HARNESS_") ? true : null;
        }
        const body = document.body ? document.body.innerText.trim() : "";
        return body.length > 40 ? true : null;
      })()`), url);
    }

    async function shot(name) {
      const metrics = await cdp.send("Page.getLayoutMetrics", {}, sessionId);
      const width = Math.ceil(metrics.cssContentSize.width);
      const height = Math.ceil(metrics.cssContentSize.height);
      const { data } = await cdp.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width, height, scale: 1 },
      }, sessionId);
      await mkdir(artifacts, { recursive: true });
      const file = join(artifacts, name);
      await writeFile(file, Buffer.from(data, "base64"));
      return file;
    }

    function expect(name, condition) {
      if (!condition) {
        failures.push(name);
        console.error(`FAIL ${name}`);
      }
    }

    await open(`${origin}/daily/test/harness.html`, 1280, 900, false);
    const harness = await evaluate("document.querySelector('#out').textContent");
    expect("harness passed", typeof harness === "string" && harness.startsWith("HARNESS_PASS"));
    if (!String(harness).startsWith("HARNESS_PASS")) console.error(harness);

    await open(`${origin}/daily/preview/christian/`, 360, 800, true);
    const christian = await evaluate(`(() => ({
      width: window.innerWidth,
      scroll: document.documentElement.scrollWidth,
      text: document.body.innerText,
      h1: document.querySelectorAll("h1").length,
      steps: document.querySelectorAll("#checklist ol.steps").length,
      title: document.title
    }))()`);
    expect("christian preview is 360 wide", christian.width === 360 && christian.scroll <= christian.width + 1);
    expect("christian preview shows steps and a finished line", christian.steps === 3 && christian.text.includes("This is finished when") && christian.text.includes("Do these steps in order"));
    expect("christian preview does not name Cam or claim a real assignment is done", !/\bCam\b/.test(christian.text) && christian.text.includes("not a real assignment") && christian.text.includes("You have not marked anything finished yet."));
    expect("christian preview title", christian.title.startsWith("Preview sample") && christian.h1 === 1);
    await shot("christian_preview_mobile_360.png");

    await evaluate(`(() => {
      document.querySelector("#done-sample-read-card").focus();
      return document.activeElement.id;
    })()`);
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 }, sessionId);
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 }, sessionId);
    await delay(50);
    const keyed = await evaluate("document.querySelector('#done-sample-read-card').checked === true && document.activeElement.id");
    expect("space key marks the focused checkbox", keyed === "done-sample-read-card");

    await evaluate(`(() => {
      const note = document.querySelector("#child-note");
      const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      set.call(note, "The last count was tricky.");
      note.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector("#help-sample-count-six").click();
      return true;
    })()`);

    await open(`${origin}/daily/preview/christian/`, 1280, 900, false);
    const wide = await evaluate("({ width: window.innerWidth, scroll: document.documentElement.scrollWidth, text: document.body.innerText })");
    expect("desktop preview has no sideways overflow", wide.width >= 1000 && wide.scroll <= wide.width + 1);
    expect("reload starts from saved preview checks", wide.text.includes("Read the sample card out loud") && wide.text.includes("The last count was tricky.") && wide.text.includes("You asked for help:"));
    const savedSummary = wide.text;
    await evaluate("document.querySelector('#send-mom').click()");
    await delay(100);
    const afterShare = await evaluate(`(() => ({
      live: document.querySelector("#live-status").textContent,
      checked: document.querySelector("#done-sample-read-card").checked,
      note: document.querySelector("#child-note").value,
      search: location.search,
      hash: location.hash,
      share: typeof navigator.share
    }))()`);
    expect("headless share does not pretend to deliver or clear the report", afterShare.live.includes("Copy summary") && afterShare.live.includes("still here") && !afterShare.live.includes("Mom received") && afterShare.checked === true && afterShare.note === "The last count was tricky." && afterShare.search === "" && afterShare.hash === "");
    expect("summary survived the share click", savedSummary.includes("You marked finished:"));

    await open(`${origin}/daily/preview/cam/`, 360, 800, true);
    const cam = await evaluate(`(() => ({
      scroll: document.documentElement.scrollWidth,
      width: window.innerWidth,
      text: document.body.innerText,
      checked: document.querySelector("#done-sample-read-card").checked
    }))()`);
    expect("cam preview fits a phone and uses compact wording", cam.width === 360 && cam.scroll <= cam.width + 1 && cam.text.includes("Finished means") && cam.text.includes("I finished this") && !cam.text.includes("I finished every step"));
    expect("cam preview does not show Christian or Christian's saved checks", !/\bChristian\b/.test(cam.text) && cam.checked === false);
    expect("each sample task keeps its own steps", cam.text.indexOf("Write a sentence that names the object.") > cam.text.indexOf("Write three sentences") && cam.text.indexOf("Place exactly six objects in a line.") > cam.text.indexOf("Count six objects"));
    await shot("cam_preview_mobile_360.png");

    async function setDate(value) {
      return evaluate(`(() => {
        const input = document.querySelector("#day-input");
        const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        set.call(input, ${JSON.stringify(value)});
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return input.value;
      })()`);
    }

    await open(`${origin}/daily/christian/`, 360, 900, true);
    const today = await evaluate(`(() => ({
      scroll: document.documentElement.scrollWidth,
      width: window.innerWidth,
      text: document.body.innerText,
      date: document.querySelector("#day-input")?.value || ""
    }))()`);
    expect("today's real page fits and hides the sample", today.width === 360 && today.scroll <= today.width + 1 && !today.text.includes("Read the sample card out loud") && /^\d{4}-\d{2}-\d{2}$/.test(today.date));
    await setDate("2026-11-13");
    const christianNov13 = await evaluate(`(() => ({
      text: document.body.innerText,
      hrefs: [...document.querySelectorAll("#checklist a")].map((anchor) => anchor.href),
      budgetLinks: document.querySelectorAll("#task-thanksgiving-budget a").length,
      scroll: document.documentElement.scrollWidth,
      width: window.innerWidth
    }))()`);
    expect("Christian November 13 shows his four tasks", christianNov13.width === 360 && christianNov13.scroll <= christianNov13.width + 1 && christianNov13.text.includes("Finish your zoo vs. sanctuary paragraph") && christianNov13.text.includes("Finish your grandpa interview sheet") && christianNov13.text.includes("Food Truck Shift 3: The Register Crashed") && christianNov13.text.includes("Optional: Thanksgiving budget, Worksheet A Steps 1-3") && christianNov13.text.includes("scale the recipes for 6") && christianNov13.text.includes("$50 target"));
    expect("Christian November 13 links the shift only", christianNov13.hrefs.some((href) => href.includes("/food-truck/day3/")) && christianNov13.budgetLinks === 0 && !/\bCam\b|woods movie|rebus|overdue|\blate\b/.test(christianNov13.text));
    await shot("christian_nov13_mobile_360.png");
    await setDate("2026-11-12");
    const nov12 = await evaluate("document.body.innerText");
    expect("November 12 has no sample tasks and no overdue list", nov12.includes("Thursday, November 12, 2026") && nov12.includes("Your plan is being prepared.") && !nov12.includes("Read the sample card out loud") && !/overdue/i.test(nov12));
    await shot("christian_nov12_preparing_mobile_360.png");
    await setDate("2026-11-14");
    const christianNov14 = await evaluate("document.body.innerText");
    expect("Christian November 14 is still being prepared", christianNov14.includes("Your plan is being prepared.") && !christianNov14.includes("Woods movie") && !christianNov14.includes("Thanksgiving"));

    await open(`${origin}/daily/cam/`, 360, 900, true);
    await setDate("2026-11-13");
    const camNov13 = await evaluate(`(() => ({
      text: document.body.innerText,
      hrefs: [...document.querySelectorAll("a")].map((anchor) => anchor.href),
      scroll: document.documentElement.scrollWidth,
      width: window.innerWidth
    }))()`);
    expect("Cam November 13 shows his plan only", camNov13.width === 360 && camNov13.scroll <= camNov13.width + 1 && camNov13.text.includes("Finish script planning for your woods movie") && camNov13.text.includes("rebus puzzles, pages 1-5") && camNov13.text.includes("Cursive practice") && camNov13.text.includes("The Cracked Tablet") && camNov13.text.includes("Optional: help set up the new laptop") && camNov13.hrefs.some((href) => href.includes("/case-files/day6/")) && !/\bChristian\b|zoo vs|Food Truck|Thanksgiving/.test(camNov13.text));
    await shot("cam_nov13_mobile_360.png");
    await setDate("2026-11-14");
    const camNov14 = await evaluate("document.body.innerText");
    expect("Cam November 14 is only today's woods movie step", camNov14.includes("Woods movie: today's step") && camNov14.includes("prep for filming") && !camNov14.includes("rebus"));

    await open(`${origin}/daily/`, 360, 900, true);
    const index = await evaluate("document.body.innerText");
    expect("coordinator lists separate links and no progress", index.includes("Cam's checklist") && index.includes("Christian's checklist") && index.includes("do not link to each other") && !index.includes("Marked finished"));
    await shot("coordinator_mobile_360.png");

    await open(`${origin}/daily/preview/christian/`, 1280, 900, false);
    await evaluate(`(() => {
      document.querySelector("#done-sample-three-sentences").click();
      document.querySelector("#help-sample-count-six").click();
      const note = document.querySelector("#child-note");
      const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      set.call(note, "The last count was tricky.");
      note.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`);
    const desktop = await evaluate("({ width: window.innerWidth, scroll: document.documentElement.scrollWidth })");
    expect("filled desktop summary does not overflow", desktop.width >= 1000 && desktop.scroll <= desktop.width + 1);
    await shot("christian_preview_desktop_summary.png");

    cdp.close();
    if (failures.length) {
      console.error(failures.join("\n"));
      process.exitCode = 1;
    } else {
      console.log("BROWSER_PASS");
    }
  } finally {
    chrome.kill("SIGKILL");
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
