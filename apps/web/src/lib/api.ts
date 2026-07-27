export type Todo = {
  id: string;
  title: string;
  isDone: boolean;
  dateKey: string;
  pageKey: string;
  sortOrder: number;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type TodoFilter = "all" | "active" | "done";
export type TemplateMode = "A" | "B" | "C";

export type UserPrefs = {
  templateMode: TemplateMode;
  lastSpreadId: string | null;
  updatedAt: string;
};

export type Book = {
  id: string;
  name: string;
  createdAt: string;
};

export type BookPage = {
  items: Book[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export type BookSession = {
  book: Book;
  token: string;
  expiresAt: string;
};

export type BookAccess = {
  accessKey: string;
  bookToken: string;
};

export type CreateTodoInput = {
  title: string;
  dateKey?: string;
  pageKey?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  notes?: string;
};

export type UpdateTodoInput = {
  title?: string;
  isDone?: boolean;
  pageKey?: string;
  sortOrder?: number;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  notes?: string | null;
};

const ACCESS_KEY_STORAGE = "book-todo.access-key";
const BOOK_SESSION_STORAGE = "book-todo.book-session";

export function loadAccessKey(): string {
  return sessionStorage.getItem(ACCESS_KEY_STORAGE) ?? "";
}

export function saveAccessKey(key: string): void {
  sessionStorage.setItem(ACCESS_KEY_STORAGE, key);
}

export function clearAccessKey(): void {
  sessionStorage.removeItem(ACCESS_KEY_STORAGE);
}

function isBookSession(value: unknown): value is BookSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<BookSession>;
  const book = session.book as Partial<Book> | undefined;
  return (
    typeof session.token === "string" &&
    session.token.length > 0 &&
    typeof session.expiresAt === "string" &&
    Number.isFinite(Date.parse(session.expiresAt)) &&
    Boolean(book) &&
    typeof book?.id === "string" &&
    typeof book.name === "string" &&
    typeof book.createdAt === "string"
  );
}

export function loadBookSession(): BookSession | null {
  const stored = sessionStorage.getItem(BOOK_SESSION_STORAGE);
  if (!stored) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (isBookSession(parsed)) return parsed;
  } catch {
    // Invalid browser state is handled as a locked book.
  }
  sessionStorage.removeItem(BOOK_SESSION_STORAGE);
  return null;
}

export function saveBookSession(session: BookSession): void {
  sessionStorage.setItem(BOOK_SESSION_STORAGE, JSON.stringify(session));
}

export function clearBookSession(): void {
  sessionStorage.removeItem(BOOK_SESSION_STORAGE);
}

async function request<T>(
  path: string,
  options: RequestInit & { accessKey?: string; bookToken?: string } = {},
): Promise<T> {
  const headers = new Headers(options.headers ?? {});
  if (options.body !== undefined && options.body !== null) {
    headers.set("Content-Type", "application/json");
  }
  if (options.accessKey) {
    headers.set("X-Access-Key", options.accessKey);
  }
  if (options.bookToken) {
    headers.set("X-Book-Token", options.bookToken);
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof data?.error === "string" ? data.error : `request_failed_${response.status}`;
    throw new Error(message);
  }

  return data as T;
}

export function verifyAccessKey(accessKey: string) {
  return request<{ ok: true }>("/api/auth/verify", {
    method: "POST",
    body: JSON.stringify({ accessKey }),
  });
}

export function listBooks(accessKey: string, page = 1, pageSize = 12) {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return request<BookPage>(`/api/books?${query.toString()}`, {
    method: "GET",
    accessKey,
  });
}

export function createBook(
  accessKey: string,
  input: { name: string; password: string },
) {
  return request<Book>("/api/books", {
    method: "POST",
    accessKey,
    body: JSON.stringify(input),
  });
}

export function unlockBook(accessKey: string, bookId: string, password: string) {
  return request<BookSession>(`/api/books/${bookId}/unlock`, {
    method: "POST",
    accessKey,
    body: JSON.stringify({ password }),
  });
}

export function updateBook(
  accessKey: string,
  bookId: string,
  input: { currentPassword: string; name?: string; newPassword?: string },
) {
  return request<Book>(`/api/books/${bookId}`, {
    method: "PATCH",
    accessKey,
    body: JSON.stringify(input),
  });
}

export function deleteBook(accessKey: string, bookId: string, password: string) {
  return request<void>(`/api/books/${bookId}`, {
    method: "DELETE",
    accessKey,
    body: JSON.stringify({ password }),
  });
}

export function listTodos(
  access: BookAccess,
  status: TodoFilter = "all",
  date?: string,
) {
  const query = new URLSearchParams();
  if (status !== "all") query.set("status", status);
  if (date) query.set("date", date);
  const suffix = query.size ? `?${query.toString()}` : "";
  return request<{ items: Todo[] }>(`/api/todos${suffix}`, {
    method: "GET",
    ...access,
  });
}

export function createTodo(access: BookAccess, input: CreateTodoInput | string) {
  const body =
    typeof input === "string"
      ? { title: input }
      : {
          title: input.title,
          date_key: input.dateKey,
          page_key: input.pageKey,
          scheduled_start: input.scheduledStart,
          scheduled_end: input.scheduledEnd,
          notes: input.notes,
        };

  return request<Todo>("/api/todos", {
    method: "POST",
    ...access,
    body: JSON.stringify(body),
  });
}

export function updateTodo(access: BookAccess, id: string, patch: UpdateTodoInput) {
  return request<Todo>(`/api/todos/${id}`, {
    method: "PATCH",
    ...access,
    body: JSON.stringify({
      title: patch.title,
      is_done: patch.isDone,
      page_key: patch.pageKey,
      sort_order: patch.sortOrder,
      scheduled_start: patch.scheduledStart,
      scheduled_end: patch.scheduledEnd,
      notes: patch.notes,
    }),
  });
}

export function deleteTodo(access: BookAccess, id: string) {
  return request<void>(`/api/todos/${id}`, {
    method: "DELETE",
    ...access,
  });
}

export function listAvailableDays(access: BookAccess) {
  return request<{ dates: string[] }>("/api/days", {
    method: "GET",
    ...access,
  });
}

export function getPrefs(access: BookAccess) {
  return request<UserPrefs>("/api/prefs", {
    method: "GET",
    ...access,
  });
}

export function updatePrefs(
  access: BookAccess,
  patch: { templateMode?: TemplateMode; lastSpreadId?: string | null },
) {
  return request<UserPrefs>("/api/prefs", {
    method: "PATCH",
    ...access,
    body: JSON.stringify({
      template_mode: patch.templateMode,
      last_spread_id: patch.lastSpreadId,
    }),
  });
}

export type DayNotes = {
  dateKey: string;
  summary: string;
  goals: string;
  notes: string;
  updatedAt: string | null;
};

export function getDayNotes(access: BookAccess, date: string) {
  return request<DayNotes>(`/api/day-notes?date=${date}`, {
    method: "GET",
    ...access,
  });
}

export function saveDayNotes(
  access: BookAccess,
  input: { date: string; summary?: string; goals?: string; notes?: string },
) {
  return request<DayNotes>("/api/day-notes", {
    method: "PUT",
    ...access,
    body: JSON.stringify(input),
  });
}
