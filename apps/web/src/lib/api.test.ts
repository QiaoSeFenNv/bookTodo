import assert from "node:assert/strict";
import test from "node:test";
import * as apiModule from "./api.js";

class MemoryStorage implements Storage {
  #values = new Map<string, string>();

  get length(): number {
    return this.#values.size;
  }

  clear(): void {
    this.#values.clear();
  }

  getItem(key: string): string | null {
    return this.#values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.#values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.#values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#values.set(key, value);
  }
}

type MultiBookApi = typeof apiModule & {
  saveBookSession(session: {
    book: { id: string; name: string; createdAt: string };
    token: string;
    expiresAt: string;
  }): void;
  loadBookSession(): {
    book: { id: string; name: string; createdAt: string };
    token: string;
    expiresAt: string;
  } | null;
  clearBookSession(): void;
  listBooks(accessKey: string, page?: number, pageSize?: number): Promise<unknown>;
  createBook(
    accessKey: string,
    input: { name: string; password: string },
  ): Promise<unknown>;
  unlockBook(accessKey: string, bookId: string, password: string): Promise<unknown>;
  listTodos(
    access: { accessKey: string; bookToken: string },
    status?: string,
    date?: string,
  ): Promise<unknown>;
  createTodo(
    access: { accessKey: string; bookToken: string },
    input: { title: string },
  ): Promise<unknown>;
  updateTodo(
    access: { accessKey: string; bookToken: string },
    id: string,
    patch: { title: string },
  ): Promise<unknown>;
  deleteTodo(
    access: { accessKey: string; bookToken: string },
    id: string,
  ): Promise<unknown>;
  listAvailableDays(access: { accessKey: string; bookToken: string }): Promise<unknown>;
  getPrefs(access: { accessKey: string; bookToken: string }): Promise<unknown>;
  updatePrefs(
    access: { accessKey: string; bookToken: string },
    patch: { lastSpreadId: string },
  ): Promise<unknown>;
  getDayNotes(
    access: { accessKey: string; bookToken: string },
    date: string,
  ): Promise<unknown>;
  saveDayNotes(
    access: { accessKey: string; bookToken: string },
    input: { date: string; notes: string },
  ): Promise<unknown>;
};

const api = apiModule as MultiBookApi;

test("stores outer access and selected book sessions independently", () => {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "sessionStorage", {
    value: storage,
    configurable: true,
  });
  const session = {
    book: {
      id: "00000000-0000-4000-8000-000000000001",
      name: "我的待办书",
      createdAt: "2026-07-27T08:00:00.000Z",
    },
    token: "signed-book-token",
    expiresAt: "2026-07-27T20:00:00.000Z",
  };

  api.saveAccessKey("outer-key");
  api.saveBookSession(session);
  assert.equal(api.loadAccessKey(), "outer-key");
  assert.deepEqual(api.loadBookSession(), session);

  api.clearBookSession();
  assert.equal(api.loadAccessKey(), "outer-key");
  assert.equal(api.loadBookSession(), null);
});

test("bookshelf requests send only the outer access key", async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    requests.push({ url: String(input), init });
    return new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await api.listBooks("outer-key", 2, 12);
    await api.createBook("outer-key", { name: "朋友的书", password: "password-123" });
    await api.unlockBook("outer-key", "00000000-0000-4000-8000-000000000001", "password-123");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requests[0].url, "/api/books?page=2&pageSize=12");
  assert.equal(requests[0].init.method, "GET");
  assert.equal(requests[1].url, "/api/books");
  assert.equal(requests[1].init.method, "POST");
  assert.deepEqual(JSON.parse(String(requests[1].init.body)), {
    name: "朋友的书",
    password: "password-123",
  });
  assert.equal(
    requests[2].url,
    "/api/books/00000000-0000-4000-8000-000000000001/unlock",
  );

  for (const request of requests) {
    const headers = new Headers(request.init.headers);
    assert.equal(headers.get("X-Access-Key"), "outer-key");
    assert.equal(headers.has("X-Book-Token"), false);
  }
});

test("book data requests always send both authentication layers", async () => {
  const requests: RequestInit[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init = {}) => {
    requests.push(init);
    return new Response(JSON.stringify({ items: [], dates: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const access = { accessKey: "outer-key", bookToken: "signed-book-token" };

  try {
    await api.listTodos(access, "all", "2026-07-27");
    await api.createTodo(access, { title: "一件事" });
    await api.updateTodo(access, "todo-id", { title: "另一件事" });
    await api.deleteTodo(access, "todo-id");
    await api.listAvailableDays(access);
    await api.getPrefs(access);
    await api.updatePrefs(access, { lastSpreadId: "2026-07-27" });
    await api.getDayNotes(access, "2026-07-27");
    await api.saveDayNotes(access, { date: "2026-07-27", notes: "记录" });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requests.length, 9);
  for (const request of requests) {
    const headers = new Headers(request.headers);
    assert.equal(headers.get("X-Access-Key"), "outer-key");
    assert.equal(headers.get("X-Book-Token"), "signed-book-token");
  }
});
