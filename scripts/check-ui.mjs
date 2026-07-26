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
const yesterdayTitle = `${titlePrefix}-昨天`;
const tomorrowTitle = `${titlePrefix}-明天`;
const noteValues = {
  summary: `浏览器验收总结-${runId}`,
  goals: `浏览器验收目标-${runId}`,
  notes: `浏览器验收备注-${runId}`,
};

function localDateKey(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function shiftDateKey(dateKey, offset) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + offset, 12));
  return date.toISOString().slice(0, 10);
}

const today = localDateKey();
const yesterday = shiftDateKey(today, -1);
const tomorrow = shiftDateKey(today, 1);

await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ executablePath: edgePath, headless: true });

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

async function seedTodo(title, dateKey) {
  const response = await api("/api/todos", {
    method: "POST",
    body: { title, date_key: dateKey, page_key: "inbox" },
  });
  assert.equal(response.status, 201, `could not seed ${dateKey}`);
  assert.equal(response.data.dateKey, dateKey);
}

async function waitForNotes(expected, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await api(`/api/day-notes?date=${today}`);
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

  if (testWrongKey) {
    await page.getByLabel("访问密钥").fill(`wrong-${runId}`);
    await page.getByRole("button", { name: "解锁", exact: true }).click();
    await page.getByRole("alert").waitFor();
    assert.match(await page.getByRole("alert").textContent(), /密钥不对/);
  }

  await page.getByLabel("访问密钥").fill(accessKey);
  await page.getByRole("button", { name: "解锁", exact: true }).click();
  await page.locator('[data-lock-state="open"]').waitFor({ timeout: 5000 });
  await page.locator(".pane-list").waitFor({ timeout: 10000 });
}

async function waitForDate(page, dateKey) {
  await page.locator(`.journal-book[data-selected-date="${dateKey}"]`).waitFor({
    timeout: 10000,
  });
  await page.locator(`.journal-grid[data-date-key="${dateKey}"]`).waitFor({
    timeout: 10000,
  });
}

async function swipe(page, direction) {
  const box = await page.locator(".journal-grid").boundingBox();
  assert(box, "journal grid is not visible for swipe");
  const startX = box.x + box.width * 0.55;
  const y = box.y + Math.min(28, box.height * 0.08);
  const delta = direction === "left" ? -90 : 90;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX + delta, y, { steps: 6 });
  await page.mouse.up();
}

let desktopLayout;
let mobileLayout;
let originalNotes;

try {
  await cleanupTestTodos();
  const notesResponse = await api(`/api/day-notes?date=${today}`);
  assert.equal(notesResponse.ok, true, "could not read existing daily notes");
  originalNotes = {
    summary: notesResponse.data.summary,
    goals: notesResponse.data.goals,
    notes: notesResponse.data.notes,
  };

  await seedTodo(yesterdayTitle, yesterday);
  await seedTodo(tomorrowTitle, tomorrow);

  const daysResponse = await api("/api/days");
  assert.equal(daysResponse.ok, true);
  assert(daysResponse.data.dates.includes(yesterday));
  assert(daysResponse.data.dates.includes(tomorrow));
  assert.deepEqual(daysResponse.data.dates, [...daysResponse.data.dates].sort());
  const indexedAtUnlock = new Set(daysResponse.data.dates);

  assert.equal((await fetch(`${apiUrl}/api/days`)).status, 401);
  assert.equal((await api("/api/todos?date=2026-02-31")).status, 400);
  assert.equal(
    (
      await api("/api/todos", {
        method: "POST",
        body: { title: `${titlePrefix}-坏日期`, date_key: "2026-02-31" },
      })
    ).status,
    400,
  );

  const allTodos = await api("/api/todos");
  assert.equal(allTodos.ok, true);
  assert(allTodos.data.items.every((todo) => /^\d{4}-\d{2}-\d{2}$/.test(todo.dateKey)));

  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const desktopPage = await desktop.newPage();
  const detailRequests = [];
  desktopPage.on("request", (request) => {
    if (request.method() !== "GET") return;
    const url = new URL(request.url());
    if (url.pathname === "/api/todos" || url.pathname === "/api/day-notes") {
      detailRequests.push({ pathname: url.pathname, date: url.searchParams.get("date") });
    }
  });

  await desktopPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  const lockedBook = await desktopPage.locator(".gate-book").boundingBox();
  assert(lockedBook, "locked book is not visible");
  assert(lockedBook.x >= 0 && lockedBook.x + lockedBook.width <= 1440);
  await desktopPage.screenshot({ path: path.join(outputDir, "desktop-locked.png") });

  await unlock(desktopPage, { testWrongKey: true });
  await waitForDate(desktopPage, today);
  const todayDetailRequests = detailRequests.filter((request) => request.date === today);
  if (indexedAtUnlock.has(today)) {
    assert(todayDetailRequests.some((request) => request.pathname === "/api/todos"));
    assert(todayDetailRequests.some((request) => request.pathname === "/api/day-notes"));
  } else {
    assert.equal(todayDetailRequests.length, 0, "empty current date triggered detail reads");
  }

  const bookVisual = await desktopPage.locator(".journal-book").evaluate((element) => ({
    backgroundImage: getComputedStyle(element).backgroundImage,
    edgeContent: getComputedStyle(element, "::before").content,
    spineWidth: document.querySelector(".journal-spine").getBoundingClientRect().width,
    spineShadow: getComputedStyle(document.querySelector(".journal-spine")).boxShadow,
  }));
  assert.match(bookVisual.backgroundImage, /paper-texture|linear-gradient/);
  assert.notEqual(bookVisual.edgeContent, "none");
  assert(bookVisual.spineWidth >= 12);
  assert.notEqual(bookVisual.spineShadow, "none");

  await swipe(desktopPage, "left");
  await waitForDate(desktopPage, yesterday);
  await desktopPage.locator(`input[value="${yesterdayTitle}"]`).waitFor();
  assert(detailRequests.some((request) => request.pathname === "/api/todos" && request.date === yesterday));
  assert(detailRequests.some((request) => request.pathname === "/api/day-notes" && request.date === yesterday));

  await swipe(desktopPage, "right");
  await waitForDate(desktopPage, today);
  await swipe(desktopPage, "right");
  await waitForDate(desktopPage, tomorrow);
  await desktopPage.locator(`input[value="${tomorrowTitle}"]`).waitFor();
  assert(detailRequests.some((request) => request.pathname === "/api/todos" && request.date === tomorrow));
  assert(detailRequests.some((request) => request.pathname === "/api/day-notes" && request.date === tomorrow));

  await desktopPage.keyboard.press("ArrowLeft");
  await waitForDate(desktopPage, today);

  const startTrigger = desktopPage.getByRole("button", { name: /开始时间，当前 09:00/ });
  await startTrigger.focus();
  await startTrigger.press("ArrowDown");
  const startHours = desktopPage.getByRole("listbox", { name: "开始时间小时" });
  await startHours.waitFor();
  await desktopPage.waitForTimeout(350);
  await desktopPage.screenshot({
    path: path.join(outputDir, "desktop-time-picker.png"),
    fullPage: true,
  });
  await desktopPage.keyboard.press("ArrowDown");
  await desktopPage.keyboard.press("Escape");
  await desktopPage.getByRole("button", { name: /开始时间，当前 10:00/ }).waitFor();
  assert.equal(await desktopPage.getByRole("dialog", { name: "开始时间选择器" }).count(), 0);

  const endTrigger = desktopPage.getByRole("button", { name: /结束时间，当前 10:00/ });
  await endTrigger.focus();
  await endTrigger.press("ArrowDown");
  const endHours = desktopPage.getByRole("listbox", { name: "结束时间小时" });
  await endHours.waitFor();
  await desktopPage.keyboard.press("ArrowDown");
  await desktopPage.keyboard.press("Escape");
  await desktopPage.getByRole("button", { name: /结束时间，当前 11:00/ }).waitFor();

  await desktopPage.getByPlaceholder("记一件小事…").fill(shortTitle);
  const createShortRequest = desktopPage.waitForRequest(
    (request) => request.url().endsWith("/api/todos") && request.method() === "POST",
  );
  await desktopPage.getByRole("button", { name: "添加", exact: true }).click();
  const shortPayload = (await createShortRequest).postDataJSON();
  assert.equal(shortPayload.date_key, today);
  const shortInput = desktopPage.locator(`input.dot-title[value="${shortTitle}"]`);
  await shortInput.waitFor();
  await shortInput.fill(renamedShortTitle);
  const renameShortResponse = desktopPage.waitForResponse(
    (response) => response.url().includes("/api/todos/") && response.request().method() === "PATCH",
  );
  await shortInput.press("Enter");
  assert.equal((await renameShortResponse).status(), 200);

  await desktopPage.getByPlaceholder("这段时间做什么…").fill(timelineTitle);
  const createTimelineRequest = desktopPage.waitForRequest(
    (request) => request.url().endsWith("/api/todos") && request.method() === "POST",
  );
  await desktopPage.getByRole("button", { name: "添加时间段" }).click();
  const timelinePayload = (await createTimelineRequest).postDataJSON();
  assert.equal(timelinePayload.date_key, today);
  assert.equal(timelinePayload.scheduled_start, "10:00");
  assert.equal(timelinePayload.scheduled_end, "11:00");
  const timelineInput = desktopPage.locator(`input.tl-title[value="${timelineTitle}"]`);
  await timelineInput.waitFor();
  await timelineInput.fill(renamedTimelineTitle);
  const renameTimelineResponse = desktopPage.waitForResponse(
    (response) => response.url().includes("/api/todos/") && response.request().method() === "PATCH",
  );
  await timelineInput.press("Enter");
  assert.equal((await renameTimelineResponse).status(), 200);

  await desktopPage.getByLabel("总结").fill(noteValues.summary);
  await desktopPage.getByLabel("目标").fill(noteValues.goals);
  await desktopPage.getByLabel("备注").fill(noteValues.notes);
  await desktopPage.locator(".pane-title").filter({ hasText: /回顾/ }).click();
  await waitForNotes(noteValues);
  await desktopPage.getByText("已保存", { exact: true }).waitFor({ timeout: 10000 });

  await desktopPage.getByRole("button", { name: "后一天" }).click();
  await waitForDate(desktopPage, tomorrow);
  await desktopPage.getByRole("button", { name: "前一天" }).click();
  await waitForDate(desktopPage, today);

  const latestDays = new Set((await api("/api/days")).data.dates);
  let emptyOffset = 2;
  while (latestDays.has(shiftDateKey(today, emptyOffset))) emptyOffset += 1;
  assert(emptyOffset < 40, "could not find a nearby empty date for the index gate test");
  const emptyDate = shiftDateKey(today, emptyOffset);
  const readsBeforeEmpty = detailRequests.filter((request) => request.date === emptyDate).length;
  for (let offset = 1; offset <= emptyOffset; offset += 1) {
    await desktopPage.getByRole("button", { name: "后一天" }).click();
    await waitForDate(desktopPage, shiftDateKey(today, offset));
  }
  assert.equal(
    detailRequests.filter((request) => request.date === emptyDate).length,
    readsBeforeEmpty,
    "empty date triggered Todo or day-note detail reads",
  );

  await desktopPage.reload({ waitUntil: "domcontentloaded" });
  await desktopPage.locator(".pane-list").waitFor();
  await waitForDate(desktopPage, today);
  assert.equal(await desktopPage.locator(".gate-stage").count(), 0);

  desktopLayout = await desktopPage.evaluate(() => {
    const left = document.querySelector(".journal-left").getBoundingClientRect();
    const right = document.querySelector(".journal-right").getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      mainRatio: left.width / (left.width + right.width),
    };
  });
  assert(desktopLayout.documentWidth <= desktopLayout.viewportWidth);
  assert(desktopLayout.mainRatio >= 0.27 && desktopLayout.mainRatio <= 0.33);
  await desktopPage.screenshot({
    path: path.join(outputDir, "desktop-workspace.png"),
    fullPage: true,
  });

  await desktopPage.getByRole("button", { name: "锁上" }).click();
  await desktopPage.locator('[data-lock-state="locked"]').waitFor();
  await desktop.close();

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const mobilePage = await mobile.newPage();
  await unlock(mobilePage);
  await waitForDate(mobilePage, today);
  const mobileStart = mobilePage.getByRole("button", { name: /开始时间/ });
  await mobileStart.click();
  const popover = await mobilePage.getByRole("dialog", { name: "开始时间选择器" }).boundingBox();
  assert(popover, "mobile time picker did not open");
  assert(popover.x >= 0 && popover.x + popover.width <= 390, "mobile picker is clipped");
  await mobilePage.screenshot({
    path: path.join(outputDir, "mobile-time-picker.png"),
    fullPage: true,
  });
  await mobilePage.keyboard.press("Escape");

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
  assert(mobileLayout.documentWidth <= mobileLayout.viewportWidth);
  assert(mobileLayout.listBottom <= mobileLayout.timelineTop);
  assert(mobileLayout.timelineBottom <= mobileLayout.reviewTop);
  await mobilePage.screenshot({
    path: path.join(outputDir, "mobile-workspace.png"),
    fullPage: true,
  });
  await mobile.close();
} finally {
  await cleanupTestTodos();
  if (originalNotes) {
    await api("/api/day-notes", { method: "PUT", body: { date: today, ...originalNotes } });
  }
  await browser.close();
}

console.log(JSON.stringify({ desktopLayout, mobileLayout, outputDir }, null, 2));
