import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const edgePath =
  process.env.EDGE_PATH ??
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const baseUrl = process.env.WEB_URL ?? "http://127.0.0.1:5173";
const apiUrl = process.env.API_URL ?? "http://127.0.0.1:3000";
const accessKey = process.env.APP_ACCESS_KEY ?? "book-todo-dev-key";
const outputDir = path.resolve("artifacts", "ui-check");
const runId = Date.now();
const titlePrefix = `浏览器验收待办-${runId}`;
const shortTitle = `${titlePrefix}-短记`;
const renamedShortTitle = `${titlePrefix}-已编辑`;
const timelineTitle = `${titlePrefix}-时间线`;
const renamedTimelineTitle = `${titlePrefix}-时间线已编辑`;
const noteValues = {
  summary: `浏览器验收总结-${runId}`,
  goals: `浏览器验收目标-${runId}`,
  notes: `浏览器验收备注-${runId}`,
};

function todayKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: edgePath,
  headless: true,
});

async function api(pathname, { method = "GET", body } = {}) {
  const headers = { "X-Access-Key": accessKey };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${apiUrl}${pathname}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  try {
    return { ok: response.ok, status: response.status, data: JSON.parse(text) };
  } catch {
    return { ok: response.ok, status: response.status, data: text };
  }
}

async function cleanupTestTodos() {
  const { ok, data } = await api("/api/todos");
  if (!ok || !Array.isArray(data?.items)) return;
  await Promise.all(
    data.items
      .filter((todo) => String(todo.title).startsWith("浏览器验收待办-"))
      .map((todo) => api(`/api/todos/${todo.id}`, { method: "DELETE" })),
  );
}

async function waitForNotes(expected, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await api(`/api/day-notes?date=${todayKey()}`);
    if (
      response.ok &&
      response.data?.summary === expected.summary &&
      response.data?.goals === expected.goals &&
      response.data?.notes === expected.notes
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assert.fail("daily writing fields were not persisted");
}

async function unlock(page, { testWrongKey = false } = {}) {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  const gate = page.locator(".gate-stage");
  await gate.waitFor({ timeout: 10000 });
  await page.getByLabel("访问密钥").waitFor();
  assert.equal(await gate.getAttribute("data-lock-state"), "locked");

  if (testWrongKey) {
    const shakeBefore = Number(await gate.getAttribute("data-shake-count"));
    await page.getByLabel("访问密钥").fill(`wrong-${runId}`);
    await page.getByRole("button", { name: "解锁", exact: true }).click();
    const alert = page.getByRole("alert");
    await alert.waitFor();
    assert.match(await alert.textContent(), /密钥不对/);
    assert.equal(await gate.getAttribute("data-lock-state"), "locked");
    assert.equal(Number(await gate.getAttribute("data-shake-count")), shakeBefore + 1);
    assert.equal(page.url().startsWith(baseUrl), true, "wrong key navigated away");
  }

  await page.getByLabel("访问密钥").fill(accessKey);
  await page.getByRole("button", { name: "解锁", exact: true }).click();
  await page.locator('[data-lock-state="unlocking"]').waitFor({ timeout: 5000 });
  assert.equal(await page.locator(".padlock-svg").getAttribute("data-open"), "true");
  await page.locator('[data-lock-state="open"]').waitFor({ timeout: 5000 });
  await page.locator(".pane-list").waitFor({ timeout: 10000 });
}

let desktopLayout;
let mobileLayout;
let originalNotes;

try {
  await cleanupTestTodos();
  const notesResponse = await api(`/api/day-notes?date=${todayKey()}`);
  assert.equal(notesResponse.ok, true, "could not read existing daily notes");
  originalNotes = {
    summary: notesResponse.data.summary,
    goals: notesResponse.data.goals,
    notes: notesResponse.data.notes,
  };

  const invalidDate = await api("/api/day-notes?date=2026-02-31");
  assert.equal(invalidDate.status, 400, "impossible day-note date was accepted");

  const unauthorizedNotes = await fetch(`${apiUrl}/api/day-notes?date=${todayKey()}`);
  assert.equal(unauthorizedNotes.status, 401, "day notes were readable without an access key");

  const oversizedNotes = await api("/api/day-notes", {
    method: "PUT",
    body: { date: todayKey(), notes: "x".repeat(4001) },
  });
  assert.equal(oversizedNotes.status, 400, "oversized day notes were accepted");

  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const desktopPage = await desktop.newPage();
  await desktopPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  const lockedBook = await desktopPage.locator(".gate-book").boundingBox();
  assert(lockedBook, "locked book is not visible");
  assert(lockedBook.x >= 0 && lockedBook.y >= 0, "desktop locked book is clipped");
  assert(
    lockedBook.x + lockedBook.width <= 1440 && lockedBook.y + lockedBook.height <= 1000,
    "desktop locked book exceeds the viewport",
  );
  for (const cue of [
    ".gate-book-pages",
    ".gate-book-cover",
    ".gate-cover-face",
    ".gate-lock",
    ".gate-form",
  ]) {
    assert.equal(await desktopPage.locator(cue).isVisible(), true, `${cue} is not visible`);
  }
  await desktopPage.screenshot({ path: path.join(outputDir, "desktop-locked.png") });

  await unlock(desktopPage, { testWrongKey: true });
  assert.equal(
    await desktopPage.evaluate(() => sessionStorage.getItem("book-todo.access-key") !== null),
    true,
    "successful key was not stored in session storage",
  );

  await desktopPage.screenshot({
    path: path.join(outputDir, "desktop-workspace.png"),
    fullPage: true,
  });

  await desktopPage.getByPlaceholder("记一件小事…").fill(shortTitle);
  const createShortResponse = desktopPage.waitForResponse(
    (response) => response.url().includes("/api/todos") && response.request().method() === "POST",
  );
  await desktopPage.getByRole("button", { name: "添加", exact: true }).click();
  assert.equal((await createShortResponse).status(), 201);
  const shortInput = desktopPage.locator(`input.dot-title[value="${shortTitle}"]`);
  await shortInput.waitFor();

  const renameShortResponse = desktopPage.waitForResponse(
    (response) => response.url().includes("/api/todos/") && response.request().method() === "PATCH",
  );
  await shortInput.fill(renamedShortTitle);
  await shortInput.press("Enter");
  assert.equal((await renameShortResponse).status(), 200);
  const renamedShortInput = desktopPage.locator(
    `input.dot-title[value="${renamedShortTitle}"]`,
  );
  const shortItem = renamedShortInput.locator("..");

  const toggleResponse = desktopPage.waitForResponse(
    (response) => response.url().includes("/api/todos/") && response.request().method() === "PATCH",
  );
  await shortItem.getByRole("button", { name: "标记为完成" }).click();
  assert.equal((await toggleResponse).status(), 200);
  await desktopPage.locator(".review-done").getByText(renamedShortTitle).waitFor();

  await desktopPage.getByLabel("开始时间").fill("13:00");
  await desktopPage.getByLabel("结束时间").fill("14:00");
  await desktopPage.getByPlaceholder("这段时间做什么…").fill(timelineTitle);
  const createTimelineResponse = desktopPage.waitForResponse(
    (response) => response.url().includes("/api/todos") && response.request().method() === "POST",
  );
  await desktopPage.getByRole("button", { name: "添加时间段" }).click();
  assert.equal((await createTimelineResponse).status(), 201);
  const timelineInput = desktopPage.locator(`input.tl-title[value="${timelineTitle}"]`);
  await timelineInput.waitFor();

  const renameTimelineResponse = desktopPage.waitForResponse(
    (response) => response.url().includes("/api/todos/") && response.request().method() === "PATCH",
  );
  await timelineInput.fill(renamedTimelineTitle);
  await timelineInput.press("Enter");
  assert.equal((await renameTimelineResponse).status(), 200);

  await desktopPage.getByLabel("总结").fill(noteValues.summary);
  await desktopPage.getByLabel("目标").fill(noteValues.goals);
  await desktopPage.getByLabel("备注").fill(noteValues.notes);
  await desktopPage.getByRole("heading", { name: "今日回顾" }).click();
  await waitForNotes(noteValues);
  await desktopPage.getByText("已保存", { exact: true }).waitFor({ timeout: 10000 });

  desktopLayout = await desktopPage.evaluate(() => {
    const box = (selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const left = box(".journal-left");
    const right = box(".journal-right");
    const list = box(".pane-list");
    const timeline = box(".pane-timeline");
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      mainRatio: left.width / (left.width + right.width),
      leftUpperRatio: list.height / (list.height + timeline.height),
      left,
      right,
      list,
      timeline,
    };
  });
  assert(
    desktopLayout.documentWidth <= desktopLayout.viewportWidth,
    "desktop has horizontal overflow",
  );
  assert(
    desktopLayout.mainRatio >= 0.27 && desktopLayout.mainRatio <= 0.33,
    `desktop main split is ${desktopLayout.mainRatio.toFixed(3)}, expected about 0.30`,
  );
  assert(
    desktopLayout.leftUpperRatio >= 0.27 && desktopLayout.leftUpperRatio <= 0.33,
    `left upper split is ${desktopLayout.leftUpperRatio.toFixed(3)}, expected about 0.30`,
  );
  assert.equal(
    await desktopPage.locator(".template-switcher, .edge-nav, .book-shell").count(),
    0,
    "legacy mode UI is present in the primary workspace",
  );

  const deleteResponse = desktopPage.waitForResponse(
    (response) => response.url().includes("/api/todos/") && response.request().method() === "DELETE",
  );
  await shortItem.getByRole("button", { name: "删除" }).click();
  assert.equal((await deleteResponse).status(), 204);
  await renamedShortInput.waitFor({ state: "detached" });

  await desktopPage.reload({ waitUntil: "domcontentloaded" });
  await desktopPage.locator(".pane-list").waitFor();
  assert.equal(await desktopPage.locator(".gate-stage").count(), 0, "session key was not reused");
  await desktopPage.getByRole("button", { name: "锁上" }).click();
  await desktopPage.locator('[data-lock-state="locked"]').waitFor();
  assert.equal(
    await desktopPage.evaluate(() => sessionStorage.getItem("book-todo.access-key")),
    null,
    "locking did not clear session storage",
  );
  await desktop.close();

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  const mobileBook = await mobilePage.locator(".gate-book").boundingBox();
  const mobileForm = await mobilePage.locator(".gate-form").boundingBox();
  assert(mobileBook && mobileForm, "mobile locked-book controls are not visible");
  assert(mobileBook.x >= 0 && mobileBook.x + mobileBook.width <= 390, "mobile book is clipped");
  assert(mobileForm.y + mobileForm.height <= 844, "mobile lock form is clipped");
  const reducedDuration = await mobilePage.locator(".gate-form").evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).transitionDuration),
  );
  assert(reducedDuration <= 0.01, "reduced-motion transition remains long");
  const reducedStart = Date.now();
  await unlock(mobilePage);
  assert(Date.now() - reducedStart < 2500, "reduced-motion unlock took too long");

  await mobilePage.screenshot({
    path: path.join(outputDir, "mobile-workspace.png"),
    fullPage: true,
  });
  mobileLayout = await mobilePage.evaluate(() => {
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
    const list = rect(".pane-list");
    const timeline = rect(".pane-timeline");
    const review = rect(".pane-review");
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      listBottom: list.bottom,
      timelineTop: timeline.top,
      timelineBottom: timeline.bottom,
      reviewTop: review.top,
    };
  });
  assert(
    mobileLayout.documentWidth <= mobileLayout.viewportWidth,
    "mobile has horizontal overflow",
  );
  assert(mobileLayout.listBottom <= mobileLayout.timelineTop, "mobile list overlaps timeline");
  assert(mobileLayout.timelineBottom <= mobileLayout.reviewTop, "mobile timeline overlaps review");
  await mobile.close();
} finally {
  await cleanupTestTodos();
  if (originalNotes) {
    await api("/api/day-notes", {
      method: "PUT",
      body: { date: todayKey(), ...originalNotes },
    });
  }
  await browser.close();
}

console.log(JSON.stringify({ desktopLayout, mobileLayout, outputDir }, null, 2));
