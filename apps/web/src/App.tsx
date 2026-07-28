import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Library,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { AccessGate } from "./components/auth/AccessGate";
import { BookshelfPage } from "./components/books/BookshelfPage";
import { CalendarDialog } from "./components/book/CalendarDialog";
import { CopyDayDialog } from "./components/book/CopyDayDialog";
import { TimePicker } from "./components/todo/TimePicker";
import {
  clearAccessKey,
  clearBookSession,
  copyDayTodos,
  createTodo,
  deleteTodo,
  getCalendar,
  getDayNotes,
  listTodos,
  loadAccessKey,
  loadBookSession,
  saveAccessKey,
  saveBookSession,
  saveDayNotes,
  type CalendarDay,
  type Todo,
  type BookAccess,
  type BookSession,
  updateTodo,
  verifyAccessKey,
} from "./lib/api";
import { dateFromKey, formatDateLabel, shiftDateKey, todayKey } from "./lib/date";
import { quoteForDate } from "./lib/quotes";
import { isValidTimeRange } from "./lib/time";

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(
      target.closest(
        "input, textarea, button, select, [contenteditable='true'], [role='dialog'], [role='listbox']",
      ),
    )
  );
}

/* ---------- 小组件 ---------- */

function DotItem({
  todo,
  onToggle,
  onRename,
  onDelete,
}: {
  todo: Todo;
  onToggle: (t: Todo) => void;
  onRename: (t: Todo, title: string) => void;
  onDelete: (t: Todo) => void;
}) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22 }}
      className={`dot-item${todo.isDone ? " done" : ""}`}
    >
      <button
        type="button"
        className="dot-check"
        data-checked={todo.isDone}
        aria-label={todo.isDone ? "标记为未完成" : "标记为完成"}
        onClick={() => onToggle(todo)}
      >
        {todo.isDone ? <Check size={11} strokeWidth={3} aria-hidden="true" /> : null}
      </button>
      <input
        className="dot-title"
        defaultValue={todo.title}
        key={`${todo.id}-${todo.title}`}
        onBlur={(e) => {
          const next = e.target.value.trim();
          if (!next) {
            e.target.value = todo.title;
            return;
          }
          if (next !== todo.title) onRename(todo, next);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      <button
        type="button"
        className="dot-delete"
        aria-label="删除"
        onClick={() => onDelete(todo)}
      >
        <Trash2 size={14} aria-hidden="true" />
      </button>
    </motion.li>
  );
}

function TimelineItem({
  todo,
  onToggle,
  onRename,
  onDelete,
}: {
  todo: Todo;
  onToggle: (t: Todo) => void;
  onRename: (t: Todo, title: string) => void;
  onDelete: (t: Todo) => void;
}) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      transition={{ duration: 0.24 }}
      className={`tl-item${todo.isDone ? " done" : ""}`}
    >
      <div className="tl-time">
        <span>{todo.scheduledStart}</span>
        <span className="tl-time-end">{todo.scheduledEnd}</span>
      </div>
      <div className="tl-node" aria-hidden="true">
        <span className="tl-dot" />
      </div>
      <div className="tl-card">
        <button
          type="button"
          className="dot-check"
          data-checked={todo.isDone}
          aria-label={todo.isDone ? "标记为未完成" : "标记为完成"}
          onClick={() => onToggle(todo)}
        >
          {todo.isDone ? <Check size={11} strokeWidth={3} aria-hidden="true" /> : null}
        </button>
        <input
          className="tl-title"
          defaultValue={todo.title}
          key={`${todo.id}-${todo.title}`}
          aria-label="待办标题"
          onBlur={(event) => {
            const next = event.target.value.trim();
            if (!next) {
              event.target.value = todo.title;
              return;
            }
            if (next !== todo.title) onRename(todo, next);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
        <button
          type="button"
          className="dot-delete"
          aria-label="删除"
          onClick={() => onDelete(todo)}
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>
    </motion.li>
  );
}

/* ---------- 主应用 ---------- */

export default function App() {
  const reduceMotion = useReducedMotion();
  const [accessKey, setAccessKey] = useState(() => loadAccessKey());
  const [siteAuthorized, setSiteAuthorized] = useState(false);
  const [bookSession, setBookSession] = useState<BookSession | null>(() => loadBookSession());
  const [bookOpen, setBookOpen] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(Boolean(loadAccessKey()));
  const [entering, setEntering] = useState(false);

  const [todos, setTodos] = useState<Todo[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [availableDates, setAvailableDates] = useState<Set<string>>(() => new Set());
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [dayDirection, setDayDirection] = useState(0);

  const [draft, setDraft] = useState("");
  const [tlTitle, setTlTitle] = useState("");
  const [tlStart, setTlStart] = useState("09:00");
  const [tlEnd, setTlEnd] = useState("10:00");
  const [tlError, setTlError] = useState("");

  const [summary, setSummary] = useState("");
  const [goals, setGoals] = useState("");
  const [notes, setNotes] = useState("");
  const [notesStatus, setNotesStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const notesTimer = useRef<number | null>(null);
  const notesLoaded = useRef(false);
  const notesRevision = useRef(0);
  const savedNotesRevision = useRef(0);
  const notesSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const selectedDateRef = useRef(selectedDate);
  const loadRevision = useRef(0);
  const navigating = useRef(false);
  const swipeStart = useRef<{ pointerId: number; x: number } | null>(null);
  const initialBootstrapStarted = useRef(false);

  const quote = useMemo(() => quoteForDate(dateFromKey(selectedDate)), [selectedDate]);
  const dateLabel = useMemo(() => formatDateLabel(selectedDate), [selectedDate]);

  const listTodosPlain = useMemo(
    () => todos.filter((t) => !t.scheduledStart),
    [todos],
  );
  const timelineTodos = useMemo(
    () =>
      todos
        .filter((t) => t.scheduledStart && t.scheduledEnd)
        .sort((a, b) => (a.scheduledStart! > b.scheduledStart! ? 1 : -1)),
    [todos],
  );
  const doneTodos = useMemo(() => todos.filter((t) => t.isDone), [todos]);
  const progress = todos.length
    ? Math.round((doneTodos.length / todos.length) * 100)
    : 0;

  const bookAccess = useMemo<BookAccess | null>(
    () =>
      accessKey && bookSession
        ? { accessKey, bookToken: bookSession.token }
        : null,
    [accessKey, bookSession],
  );

  const refreshCalendar = useCallback(
    async (access: BookAccess) => {
      try {
        const result = await getCalendar(access);
        setCalendarDays(result.days);
        setAvailableDates(new Set(result.days.map((day) => day.date)));
      } catch {
        // Calendar metadata is best-effort; the day view stays usable without it.
      }
    },
    [],
  );

  const resetWorkspace = useCallback(() => {
    if (notesTimer.current) window.clearTimeout(notesTimer.current);
    loadRevision.current += 1;
    const today = todayKey();
    selectedDateRef.current = today;
    setSelectedDate(today);
    setTodos([]);
    setSummary("");
    setGoals("");
    setNotes("");
    setDraft("");
    setTlTitle("");
    setTlError("");
    setNotesStatus("idle");
    notesLoaded.current = false;
    notesRevision.current = 0;
    savedNotesRevision.current = 0;
    notesSaveQueue.current = Promise.resolve();
    setAvailableDates(new Set());
    setCalendarDays([]);
    setCalendarOpen(false);
    setCopyOpen(false);
    setError("");
  }, []);

  const closeBook = useCallback(() => {
    clearBookSession();
    setBookSession(null);
    setBookOpen(false);
    resetWorkspace();
  }, [resetWorkspace]);

  const closeSite = useCallback(() => {
    clearAccessKey();
    setAccessKey("");
    setSiteAuthorized(false);
    closeBook();
  }, [closeBook]);

  const runMutation = useCallback(async <T,>(operation: () => Promise<T>) => {
    setError("");
    try {
      return await operation();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "request_failed";
      if (message === "unauthorized") {
        closeSite();
        return null;
      }
      if (message === "book_unauthorized") {
        closeBook();
        return null;
      }
      setError("同步失败，请确认服务与数据库已启动。");
      return null;
    }
  }, [closeBook, closeSite]);

  const persistDayNotes = useCallback(
    async (
      access: BookAccess,
      date: string,
      values: { summary: string; goals: string; notes: string },
      revision: number,
    ) => {
      if (!notesLoaded.current || revision <= savedNotesRevision.current) return true;
      setNotesStatus("saving");
      try {
        const request = notesSaveQueue.current.then(async () => {
          await saveDayNotes(access, { date, ...values });
        });
        notesSaveQueue.current = request.catch(() => undefined);
        await request;
        savedNotesRevision.current = Math.max(savedNotesRevision.current, revision);
        if (selectedDateRef.current === date) {
          setNotesStatus(notesRevision.current === revision ? "saved" : "idle");
        }
        if (values.summary.trim() || values.goals.trim() || values.notes.trim()) {
          setAvailableDates((current) => new Set(current).add(date));
        }
        void refreshCalendar(access);
        return true;
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "request_failed";
        if (message === "unauthorized") {
          closeSite();
          return false;
        }
        if (message === "book_unauthorized") {
          closeBook();
          return false;
        }
        if (selectedDateRef.current === date) {
          setNotesStatus("error");
          setError("日记内容保存失败，请稍后重试。");
        }
        return false;
      }
    },
    [closeBook, closeSite, refreshCalendar],
  );

  const loadDay = useCallback(async (access: BookAccess, date: string, knownDates: Set<string>) => {
    const revision = ++loadRevision.current;
    setLoading(true);
    setError("");
    notesLoaded.current = false;
    setTodos([]);
    setSummary("");
    setGoals("");
    setNotes("");
    notesRevision.current = 0;
    savedNotesRevision.current = 0;
    setNotesStatus("idle");

    if (!knownDates.has(date)) {
      notesLoaded.current = true;
      setLoading(false);
      return;
    }

    try {
      const [todoResult, dayNotes] = await Promise.all([
        listTodos(access, "all", date),
        getDayNotes(access, date),
      ]);
      if (revision !== loadRevision.current || selectedDateRef.current !== date) return;
      setTodos(todoResult.items);
      setSummary(dayNotes.summary);
      setGoals(dayNotes.goals);
      setNotes(dayNotes.notes);
      notesRevision.current = 0;
      savedNotesRevision.current = 0;
      notesLoaded.current = true;
      setNotesStatus("idle");
    } catch (caught) {
      if (revision !== loadRevision.current) return;
      const message = caught instanceof Error ? caught.message : "load_failed";
      if (message === "unauthorized") {
        closeSite();
      } else if (message === "book_unauthorized") {
        closeBook();
      } else {
        setError("读取这一天的数据失败，请稍后重试。");
        setNotesStatus("error");
      }
    } finally {
      if (revision === loadRevision.current) setLoading(false);
    }
  }, [closeBook, closeSite]);

  const bootstrapBook = useCallback(
    async (access: BookAccess) => {
      setLoading(true);
      setError("");
      try {
        const result = await getCalendar(access);
        const dates = new Set(result.days.map((day) => day.date));
        setCalendarDays(result.days);
        setAvailableDates(dates);
        setBookOpen(true);
        await loadDay(access, selectedDateRef.current, dates);
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "load_failed";
        if (message === "unauthorized") {
          closeSite();
        } else if (message === "book_unauthorized") {
          closeBook();
        } else {
          setBookOpen(true);
          setError("读取日期索引失败，请稍后重试。");
        }
      } finally {
        setLoading(false);
        setBootstrapping(false);
      }
    },
    [closeBook, closeSite, loadDay],
  );

  useEffect(() => {
    if (initialBootstrapStarted.current) return;
    initialBootstrapStarted.current = true;
    if (!accessKey) {
      setBootstrapping(false);
      return;
    }
    void verifyAccessKey(accessKey)
      .then(async () => {
        setSiteAuthorized(true);
        if (bookSession) {
          await bootstrapBook({ accessKey, bookToken: bookSession.token });
        }
      })
      .catch(() => {
        closeSite();
      })
      .finally(() => setBootstrapping(false));
  }, [accessKey, bookSession, bootstrapBook, closeSite]);

  useEffect(() => {
    if (!bookOpen || !bookAccess || !notesLoaded.current) return;
    const revision = notesRevision.current;
    if (revision <= savedNotesRevision.current) return;
    if (notesTimer.current) window.clearTimeout(notesTimer.current);
    notesTimer.current = window.setTimeout(() => {
      void persistDayNotes(
        bookAccess,
        selectedDate,
        { summary, goals, notes },
        revision,
      );
    }, 700);
    return () => {
      if (notesTimer.current) window.clearTimeout(notesTimer.current);
    };
  }, [summary, goals, notes, bookOpen, bookAccess, selectedDate, persistDayNotes]);

  function markNotesChanged() {
    notesRevision.current += 1;
    setNotesStatus("idle");
    setError((current) =>
      current === "日记内容保存失败，请稍后重试。" ? "" : current,
    );
  }

  const flushDayNotes = useCallback(async () => {
    if (!bookAccess || !notesLoaded.current) return true;
    if (notesTimer.current) window.clearTimeout(notesTimer.current);
    return persistDayNotes(
      bookAccess,
      selectedDateRef.current,
      { summary, goals, notes },
      notesRevision.current,
    );
  }, [bookAccess, goals, notes, persistDayNotes, summary]);

  const refreshWorkspace = useCallback(async () => {
    if (!bookAccess) return;
    setLoading(true);
    setError("");
    try {
      await refreshCalendar(bookAccess);
      await loadDay(bookAccess, selectedDateRef.current, availableDates);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "load_failed";
      if (message === "unauthorized") {
        closeSite();
      } else if (message === "book_unauthorized") {
        closeBook();
      } else {
        setError("刷新失败，请稍后重试。");
      }
    } finally {
      setLoading(false);
    }
  }, [bookAccess, availableDates, closeBook, closeSite, loadDay, refreshCalendar]);

  const goToDate = useCallback(
    async (date: string, direction?: number) => {
      if (!bookAccess) return;
      const current = selectedDateRef.current;
      if (date === current) return;
      const dir = direction ?? (date > current ? -1 : 1);
      selectedDateRef.current = date;
      setDayDirection(dir);
      setSelectedDate(date);
      setDraft("");
      setTlTitle("");
      setTlError("");
      await loadDay(bookAccess, date, availableDates);
    },
    [bookAccess, availableDates, loadDay],
  );

  const navigateDay = useCallback(
    async (offset: -1 | 1) => {
      if (!bookAccess || navigating.current) return;
      navigating.current = true;
      try {
        const notesSaved = await flushDayNotes();
        if (!notesSaved) return;
        const nextDate = shiftDateKey(selectedDateRef.current, offset);
        await goToDate(nextDate, offset);
      } finally {
        navigating.current = false;
      }
    },
    [bookAccess, flushDayNotes, goToDate],
  );

  useEffect(() => {
    if (!bookOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isInteractiveTarget(event.target)) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        void navigateDay(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        void navigateDay(1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [bookOpen, navigateDay]);

  const handleAuthorized = useCallback((key: string) => {
    saveAccessKey(key);
    setAccessKey(key);
    setSiteAuthorized(true);
    setEntering(true);
    window.setTimeout(() => setEntering(false), 60);
  }, []);

  const handleBookUnlocked = useCallback(
    (session: BookSession) => {
      saveBookSession(session);
      setBookSession(session);
      setEntering(true);
      void bootstrapBook({ accessKey, bookToken: session.token }).finally(() => {
        window.setTimeout(() => setEntering(false), 60);
      });
    },
    [accessKey, bootstrapBook],
  );

  const handleOuterLogout = useCallback(() => closeSite(), [closeSite]);

  async function handleReturnToShelf() {
    if (await flushDayNotes()) closeBook();
  }

  async function handleCreateDot(e: React.FormEvent) {
    e.preventDefault();
    if (!bookAccess || !draft.trim()) return;
    const date = selectedDateRef.current;
    const created = await runMutation(() =>
      createTodo(bookAccess, { title: draft.trim(), dateKey: date, pageKey: "inbox" }),
    );
    if (created) {
      if (selectedDateRef.current === date) setTodos((cur) => [created, ...cur]);
      setAvailableDates((current) => new Set(current).add(date));
      setDraft("");
    }
  }

  async function handleCreateTimeline(e: React.FormEvent) {
    e.preventDefault();
    setTlError("");
    if (!bookAccess || !tlTitle.trim()) return;
    if (!isValidTimeRange(tlStart, tlEnd)) {
      setTlError("结束时间需要晚于开始时间");
      return;
    }
    const date = selectedDateRef.current;
    const created = await runMutation(() =>
      createTodo(bookAccess, {
        title: tlTitle.trim(),
        dateKey: date,
        pageKey: "schedule",
        scheduledStart: tlStart,
        scheduledEnd: tlEnd,
      }),
    );
    if (created) {
      if (selectedDateRef.current === date) setTodos((cur) => [created, ...cur]);
      setAvailableDates((current) => new Set(current).add(date));
      setTlTitle("");
    }
  }

  async function handleToggle(todo: Todo) {
    if (!bookAccess) return;
    const updated = await runMutation(() =>
      updateTodo(bookAccess, todo.id, { isDone: !todo.isDone }),
    );
    if (updated && updated.dateKey === selectedDateRef.current) {
      setTodos((cur) => cur.map((t) => (t.id === todo.id ? updated : t)));
    }
  }

  async function handleRename(todo: Todo, title: string) {
    if (!bookAccess) return;
    const updated = await runMutation(() => updateTodo(bookAccess, todo.id, { title }));
    if (updated && updated.dateKey === selectedDateRef.current) {
      setTodos((cur) => cur.map((t) => (t.id === todo.id ? updated : t)));
    }
  }

  async function handleDelete(todo: Todo) {
    if (!bookAccess) return;
    const ok = await runMutation(async () => {
      await deleteTodo(bookAccess, todo.id);
      return true;
    });
    if (ok) {
      if (todo.dateKey === selectedDateRef.current) {
        setTodos((cur) => cur.filter((t) => t.id !== todo.id));
      }
      void refreshCalendar(bookAccess);
    }
  }

  async function handleSelectCalendarDate(date: string) {
    setCalendarOpen(false);
    if (date === selectedDateRef.current) return;
    const notesSaved = await flushDayNotes();
    if (!notesSaved) return;
    await goToDate(date);
  }

  async function handleCopyDay(sourceDate: string): Promise<number | false> {
    if (!bookAccess) return false;
    const date = selectedDateRef.current;
    const result = await runMutation(() =>
      copyDayTodos(bookAccess, { sourceDate, targetDate: date }),
    );
    if (!result) return false;
    if (result.copied > 0) {
      if (selectedDateRef.current === date) {
        setTodos((cur) => [...result.items, ...cur]);
      }
      setAvailableDates((current) => new Set(current).add(date));
      void refreshCalendar(bookAccess);
    }
    return result.copied;
  }

  /* ---------- 渲染 ---------- */

  if (bootstrapping) {
    return (
      <div className="gate-scene">
        <p className="boot-hint">正在打开书房…</p>
      </div>
    );
  }

  if (!siteAuthorized) {
    return <AccessGate initialKey={accessKey} onSuccess={handleAuthorized} />;
  }

  if (!bookOpen || !bookSession) {
    return (
      <BookshelfPage
        accessKey={accessKey}
        onBookUnlocked={handleBookUnlocked}
        onLogout={handleOuterLogout}
      />
    );
  }

  return (
    <div className="journal-scene">
      <motion.div
        className="journal-book"
        data-selected-date={selectedDate}
        onPointerDown={(event) => {
          if (event.button !== 0 || isInteractiveTarget(event.target)) return;
          swipeStart.current = { pointerId: event.pointerId, x: event.clientX };
        }}
        onPointerUp={(event) => {
          const start = swipeStart.current;
          swipeStart.current = null;
          if (!start || start.pointerId !== event.pointerId) return;
          const distance = event.clientX - start.x;
          if (distance <= -50) void navigateDay(-1);
          else if (distance >= 50) void navigateDay(1);
        }}
        onPointerCancel={() => {
          swipeStart.current = null;
        }}
        initial={
          entering && !reduceMotion
            ? { opacity: 0, rotateX: 8, y: 34, scale: 0.97 }
            : false
        }
        animate={{ opacity: 1, rotateX: 0, y: 0, scale: 1 }}
        transition={{ duration: reduceMotion ? 0.01 : 0.85, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* 书页顶部 */}
        <header className="journal-header">
          <div className="journal-date">
            <span className="journal-book-name">{bookSession.book.name}</span>
            <div className="journal-date-nav">
              <button
                type="button"
                className="date-nav-btn"
                aria-label="前一天"
                title="前一天"
                disabled={loading}
                onClick={() => void navigateDay(-1)}
              >
                <ChevronLeft size={17} aria-hidden="true" />
              </button>
              <time className="journal-date-num" dateTime={selectedDate}>
                {dateLabel}
              </time>
              <span
                className="journal-date-state"
                data-available={availableDates.has(selectedDate)}
                aria-label={availableDates.has(selectedDate) ? "这一天有记录" : "这一天是空白页"}
                title={availableDates.has(selectedDate) ? "这一天有记录" : "这一天是空白页"}
              />
              <button
                type="button"
                className="date-nav-btn"
                aria-label="后一天"
                title="后一天"
                disabled={loading}
                onClick={() => void navigateDay(1)}
              >
                <ChevronRight size={17} aria-hidden="true" />
              </button>
            </div>
            <span className="journal-quote">「{quote}」</span>
          </div>
          <div className="journal-actions">
            <button
              type="button"
              className="ghost-btn"
              aria-label="日历检索"
              title="日历检索"
              onClick={() => setCalendarOpen(true)}
            >
              <CalendarDays size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="ghost-btn"
              aria-label="复制某一天到当前"
              title="复制某一天到当前"
              onClick={() => setCopyOpen(true)}
            >
              <Copy size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="ghost-btn"
              aria-label="刷新"
              title="刷新"
              disabled={loading}
              onClick={() => void refreshWorkspace()}
            >
              <RefreshCw size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="ghost-btn"
              aria-label="返回书架"
              title="返回书架"
              onClick={() => void handleReturnToShelf()}
            >
              <Library size={15} aria-hidden="true" />
            </button>
          </div>
        </header>

        {error ? (
          <p className="journal-error" role="alert">
            {error}
          </p>
        ) : null}

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={selectedDate}
            className="journal-grid"
            data-date-key={selectedDate}
            initial={reduceMotion ? false : { opacity: 0.45, x: dayDirection * 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0.25, x: dayDirection * -18 }}
            transition={{ duration: reduceMotion ? 0.01 : 0.24, ease: "easeOut" }}
          >
          {/* 左列 */}
          <div className="journal-left">
            {/* 上：清单（3） */}
            <section className="pane pane-list">
              <h2 className="pane-title">
                <span className="pane-title-zh">待办</span>
                <span className="pane-title-en">Notes</span>
              </h2>
              <form className="dot-composer" onSubmit={handleCreateDot}>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="记一件小事…"
                  maxLength={200}
                />
                <button type="submit" aria-label="添加" disabled={!draft.trim()}>
                  <Plus size={16} aria-hidden="true" />
                </button>
              </form>
              <ul className="dot-list">
                <AnimatePresence initial={false}>
                  {listTodosPlain.map((todo) => (
                    <DotItem
                      key={todo.id}
                      todo={todo}
                      onToggle={handleToggle}
                      onRename={handleRename}
                      onDelete={handleDelete}
                    />
                  ))}
                </AnimatePresence>
                {listTodosPlain.length === 0 ? (
                  <li className="pane-empty">还没有记录，写一条吧。</li>
                ) : null}
              </ul>
            </section>

            {/* 下：时间线（7） */}
            <section className="pane pane-timeline">
              <h2 className="pane-title">
                <span className="pane-title-zh">时间线</span>
                <span className="pane-title-en">Timeline</span>
              </h2>
              <form className="tl-composer" onSubmit={handleCreateTimeline}>
                <div className="tl-composer-times">
                  <TimePicker
                    label="开始时间"
                    value={tlStart}
                    onChange={setTlStart}
                  />
                  <span className="tl-composer-sep">→</span>
                  <TimePicker
                    label="结束时间"
                    value={tlEnd}
                    onChange={setTlEnd}
                    align="end"
                  />
                </div>
                <input
                  className="tl-composer-title"
                  value={tlTitle}
                  onChange={(e) => setTlTitle(e.target.value)}
                  placeholder="这段时间做什么…"
                  maxLength={200}
                />
                <button type="submit" aria-label="添加时间段" disabled={!tlTitle.trim()}>
                  <Plus size={16} aria-hidden="true" />
                </button>
              </form>
              {tlError ? <p className="journal-error small">{tlError}</p> : null}
              <ul className="tl-list">
                <AnimatePresence initial={false}>
                  {timelineTodos.map((todo) => (
                    <TimelineItem
                      key={todo.id}
                      todo={todo}
                      onToggle={handleToggle}
                      onRename={handleRename}
                      onDelete={handleDelete}
                    />
                  ))}
                </AnimatePresence>
                {timelineTodos.length === 0 ? (
                  <li className="pane-empty">还没有安排，添加一个时间段。</li>
                ) : null}
              </ul>
            </section>
          </div>

          {/* 书脊 */}
          <div className="journal-spine" aria-hidden="true" />

          {/* 右列 */}
          <div className="journal-right">
            <section className="pane pane-review">
              <h2 className="pane-title">
                <span className="pane-title-zh">
                  {selectedDate === todayKey() ? "今日回顾" : "当日回顾"}
                </span>
                <span className="pane-title-en">Review</span>
              </h2>

              <div className="review-progress">
                <div className="review-progress-nums">
                  <strong>{doneTodos.length}</strong>
                  <span>/ {todos.length} 已完成</span>
                </div>
                <div
                  className="review-bar"
                  role="progressbar"
                    aria-label="当日完成进度"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress}
                >
                  <motion.div
                    className="review-bar-fill"
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: reduceMotion ? 0.01 : 0.5, ease: "easeOut" }}
                  />
                </div>
              </div>

              <ul className="review-done">
                <AnimatePresence initial={false}>
                  {doneTodos.slice(0, 6).map((todo) => (
                    <motion.li
                      key={todo.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <Check size={12} strokeWidth={3} aria-hidden="true" />
                      <span>{todo.title}</span>
                    </motion.li>
                  ))}
                </AnimatePresence>
                {doneTodos.length === 0 ? (
                  <li className="pane-empty">完成的事会在这里留下印记。</li>
                ) : null}
              </ul>

              <label className="review-field">
                <span>总结</span>
                <textarea
                  value={summary}
                  onChange={(e) => {
                    markNotesChanged();
                    setSummary(e.target.value);
                  }}
                  onBlur={flushDayNotes}
                  placeholder="今天过得怎么样…"
                  rows={4}
                  maxLength={2000}
                />
              </label>

              <label className="review-field">
                <span>目标</span>
                <textarea
                  value={goals}
                  onChange={(e) => {
                    markNotesChanged();
                    setGoals(e.target.value);
                  }}
                  onBlur={flushDayNotes}
                  placeholder="接下来想去哪里…"
                  rows={4}
                  maxLength={2000}
                />
              </label>

              <label className="review-field review-field-notes">
                <span>备注</span>
                <textarea
                  value={notes}
                  onChange={(e) => {
                    markNotesChanged();
                    setNotes(e.target.value);
                  }}
                  onBlur={flushDayNotes}
                  placeholder="留下细节、想法或明天要记得的事…"
                  rows={6}
                  maxLength={4000}
                />
              </label>

              <p className={`notes-status ${notesStatus}`} role="status" aria-live="polite">
                {notesStatus === "saving"
                  ? "保存中…"
                  : notesStatus === "saved"
                    ? "已保存"
                    : notesStatus === "error"
                      ? "保存失败"
                      : ""}
              </p>
            </section>
          </div>
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {calendarOpen ? (
        <CalendarDialog
          days={calendarDays}
          selectedDate={selectedDate}
          today={todayKey()}
          onSelect={(date) => void handleSelectCalendarDate(date)}
          onClose={() => setCalendarOpen(false)}
        />
      ) : null}

      {copyOpen ? (
        <CopyDayDialog
          days={calendarDays}
          targetDate={selectedDate}
          onClose={() => setCopyOpen(false)}
          onCopy={handleCopyDay}
        />
      ) : null}
    </div>
  );
}
