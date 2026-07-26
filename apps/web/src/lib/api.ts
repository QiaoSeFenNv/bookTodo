export type Todo = {
  id: string;
  title: string;
  isDone: boolean;
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

export type CreateTodoInput = {
  title: string;
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

export function loadAccessKey(): string {
  return sessionStorage.getItem(ACCESS_KEY_STORAGE) ?? "";
}

export function saveAccessKey(key: string): void {
  sessionStorage.setItem(ACCESS_KEY_STORAGE, key);
}

export function clearAccessKey(): void {
  sessionStorage.removeItem(ACCESS_KEY_STORAGE);
}

async function request<T>(
  path: string,
  options: RequestInit & { accessKey?: string } = {},
): Promise<T> {
  const headers = new Headers(options.headers ?? {});
  if (options.body !== undefined && options.body !== null) {
    headers.set("Content-Type", "application/json");
  }
  if (options.accessKey) {
    headers.set("X-Access-Key", options.accessKey);
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

export function listTodos(accessKey: string, status: TodoFilter = "all") {
  const query = status === "all" ? "" : `?status=${status}`;
  return request<{ items: Todo[] }>(`/api/todos${query}`, {
    method: "GET",
    accessKey,
  });
}

export function createTodo(accessKey: string, input: CreateTodoInput | string) {
  const body =
    typeof input === "string"
      ? { title: input }
      : {
          title: input.title,
          page_key: input.pageKey,
          scheduled_start: input.scheduledStart,
          scheduled_end: input.scheduledEnd,
          notes: input.notes,
        };

  return request<Todo>("/api/todos", {
    method: "POST",
    accessKey,
    body: JSON.stringify(body),
  });
}

export function updateTodo(accessKey: string, id: string, patch: UpdateTodoInput) {
  return request<Todo>(`/api/todos/${id}`, {
    method: "PATCH",
    accessKey,
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

export function deleteTodo(accessKey: string, id: string) {
  return request<void>(`/api/todos/${id}`, {
    method: "DELETE",
    accessKey,
  });
}

export function getPrefs(accessKey: string) {
  return request<UserPrefs>("/api/prefs", {
    method: "GET",
    accessKey,
  });
}

export function updatePrefs(
  accessKey: string,
  patch: { templateMode?: TemplateMode; lastSpreadId?: string | null },
) {
  return request<UserPrefs>("/api/prefs", {
    method: "PATCH",
    accessKey,
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

export function getDayNotes(accessKey: string, date: string) {
  return request<DayNotes>(`/api/day-notes?date=${date}`, {
    method: "GET",
    accessKey,
  });
}

export function saveDayNotes(
  accessKey: string,
  input: { date: string; summary?: string; goals?: string; notes?: string },
) {
  return request<DayNotes>("/api/day-notes", {
    method: "PUT",
    accessKey,
    body: JSON.stringify(input),
  });
}
