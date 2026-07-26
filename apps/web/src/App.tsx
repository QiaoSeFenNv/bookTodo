import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, LockKeyhole, Plus, RefreshCw, Trash2 } from "lucide-react";
import { AccessGate } from "./components/auth/AccessGate";
import {
  clearAccessKey,
  createTodo,
  deleteTodo,
  getDayNotes,
  listTodos,
  loadAccessKey,
  saveAccessKey,
  saveDayNotes,
  type Todo,
  updateTodo,
} from "./lib/api";
import { quoteForDate } from "./lib/quotes";
import { isValidTimeRange } from "./lib/time";

function todayKey(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
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
  const [authorized, setAuthorized] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(Boolean(loadAccessKey()));
  const [entering, setEntering] = useState(false);

  const [todos, setTodos] = useState<Todo[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

  const quote = useMemo(() => quoteForDate(), []);
  const dateKey = useMemo(() => todayKey(), []);
  const dateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("zh-CN", {
        month: "long",
        day: "numeric",
        weekday: "long",
      }).format(new Date()),
    [],
  );

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

  const runMutation = useCallback(async <T,>(operation: () => Promise<T>) => {
    setError("");
    try {
      return await operation();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "request_failed";
      if (message === "unauthorized") {
        clearAccessKey();
        setAccessKey("");
        setAuthorized(false);
        return null;
      }
      setError("同步失败，请确认服务与数据库已启动。");
      return null;
    }
  }, []);

  const persistDayNotes = useCallback(
    async (
      key: string,
      date: string,
      values: { summary: string; goals: string; notes: string },
      revision: number,
    ) => {
      if (!notesLoaded.current || revision <= savedNotesRevision.current) return;
      setNotesStatus("saving");
      try {
        const request = notesSaveQueue.current.then(async () => {
          await saveDayNotes(key, { date, ...values });
        });
        notesSaveQueue.current = request.catch(() => undefined);
        await request;
        savedNotesRevision.current = Math.max(savedNotesRevision.current, revision);
        setNotesStatus(notesRevision.current === revision ? "saved" : "idle");
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "request_failed";
        if (message === "unauthorized") {
          clearAccessKey();
          setAccessKey("");
          setAuthorized(false);
          return;
        }
        setNotesStatus("error");
        setError("日记内容保存失败，请稍后重试。");
      }
    },
    [],
  );

  const bootstrap = useCallback(
    async (key: string) => {
      setLoading(true);
      setError("");
      try {
        const todoResult = await listTodos(key, "all");
        setTodos(todoResult.items);

        try {
          const dayNotes = await getDayNotes(key, todayKey());
          setSummary(dayNotes.summary);
          setGoals(dayNotes.goals);
          setNotes(dayNotes.notes);
          notesRevision.current = 0;
          savedNotesRevision.current = 0;
          notesLoaded.current = true;
          setNotesStatus("idle");
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : "request_failed";
          if (message === "unauthorized") throw caught;
          notesLoaded.current = false;
          setNotesStatus("error");
          setError("待办已加载，但日记内容读取失败。");
        }
        setAuthorized(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : "load_failed";
        if (message === "unauthorized") {
          clearAccessKey();
          setAccessKey("");
          setAuthorized(false);
        } else {
          notesLoaded.current = false;
          setNotesStatus("error");
          setAuthorized(true);
        }
        setError("读取数据失败，请稍后重试。");
      } finally {
        setLoading(false);
        setBootstrapping(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!accessKey) {
      setBootstrapping(false);
      return;
    }
    void bootstrap(accessKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!authorized || !accessKey || !notesLoaded.current) return;
    const revision = notesRevision.current;
    if (revision <= savedNotesRevision.current) return;
    if (notesTimer.current) window.clearTimeout(notesTimer.current);
    notesTimer.current = window.setTimeout(() => {
      void persistDayNotes(
        accessKey,
        dateKey,
        { summary, goals, notes },
        revision,
      );
    }, 700);
    return () => {
      if (notesTimer.current) window.clearTimeout(notesTimer.current);
    };
  }, [summary, goals, notes, authorized, accessKey, dateKey, persistDayNotes]);

  function markNotesChanged() {
    notesRevision.current += 1;
    setNotesStatus("idle");
    setError((current) =>
      current === "日记内容保存失败，请稍后重试。" ? "" : current,
    );
  }

  function flushDayNotes() {
    if (!accessKey || !notesLoaded.current) return;
    if (notesTimer.current) window.clearTimeout(notesTimer.current);
    void persistDayNotes(
      accessKey,
      dateKey,
      { summary, goals, notes },
      notesRevision.current,
    );
  }

  function handleAuthorized(key: string) {
    saveAccessKey(key);
    setAccessKey(key);
    setEntering(true);
    void bootstrap(key).then(() => {
      window.setTimeout(() => setEntering(false), 60);
    });
  }

  function handleLogout() {
    flushDayNotes();
    if (notesTimer.current) window.clearTimeout(notesTimer.current);
    clearAccessKey();
    setAccessKey("");
    setAuthorized(false);
    setTodos([]);
    setSummary("");
    setGoals("");
    setNotes("");
    setNotesStatus("idle");
    notesLoaded.current = false;
    notesRevision.current = 0;
    savedNotesRevision.current = 0;
  }

  async function handleCreateDot(e: React.FormEvent) {
    e.preventDefault();
    if (!accessKey || !draft.trim()) return;
    const created = await runMutation(() =>
      createTodo(accessKey, { title: draft.trim(), pageKey: "inbox" }),
    );
    if (created) {
      setTodos((cur) => [created, ...cur]);
      setDraft("");
    }
  }

  async function handleCreateTimeline(e: React.FormEvent) {
    e.preventDefault();
    setTlError("");
    if (!accessKey || !tlTitle.trim()) return;
    if (!isValidTimeRange(tlStart, tlEnd)) {
      setTlError("结束时间需要晚于开始时间");
      return;
    }
    const created = await runMutation(() =>
      createTodo(accessKey, {
        title: tlTitle.trim(),
        pageKey: "schedule",
        scheduledStart: tlStart,
        scheduledEnd: tlEnd,
      }),
    );
    if (created) {
      setTodos((cur) => [created, ...cur]);
      setTlTitle("");
    }
  }

  async function handleToggle(todo: Todo) {
    if (!accessKey) return;
    const updated = await runMutation(() =>
      updateTodo(accessKey, todo.id, { isDone: !todo.isDone }),
    );
    if (updated) {
      setTodos((cur) => cur.map((t) => (t.id === todo.id ? updated : t)));
    }
  }

  async function handleRename(todo: Todo, title: string) {
    if (!accessKey) return;
    const updated = await runMutation(() => updateTodo(accessKey, todo.id, { title }));
    if (updated) {
      setTodos((cur) => cur.map((t) => (t.id === todo.id ? updated : t)));
    }
  }

  async function handleDelete(todo: Todo) {
    if (!accessKey) return;
    const ok = await runMutation(async () => {
      await deleteTodo(accessKey, todo.id);
      return true;
    });
    if (ok) setTodos((cur) => cur.filter((t) => t.id !== todo.id));
  }

  /* ---------- 渲染 ---------- */

  if (bootstrapping) {
    return (
      <div className="gate-scene">
        <p className="boot-hint">正在打开你的书…</p>
      </div>
    );
  }

  if (!authorized) {
    return <AccessGate initialKey={accessKey} onSuccess={handleAuthorized} />;
  }

  return (
    <div className="journal-scene">
      <motion.div
        className="journal-book"
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
            <span className="journal-date-num">{dateLabel}</span>
            <span className="journal-quote">「{quote}」</span>
          </div>
          <div className="journal-actions">
            <button
              type="button"
              className="ghost-btn"
              aria-label="刷新"
              title="刷新"
              disabled={loading}
              onClick={() => accessKey && void bootstrap(accessKey)}
            >
              <RefreshCw size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="ghost-btn"
              aria-label="锁上"
              title="锁上"
              onClick={handleLogout}
            >
              <LockKeyhole size={15} aria-hidden="true" />
            </button>
          </div>
        </header>

        {error ? (
          <p className="journal-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="journal-grid">
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
                  <input
                    type="time"
                    value={tlStart}
                    onChange={(e) => setTlStart(e.target.value)}
                    aria-label="开始时间"
                    required
                  />
                  <span className="tl-composer-sep">→</span>
                  <input
                    type="time"
                    value={tlEnd}
                    onChange={(e) => setTlEnd(e.target.value)}
                    aria-label="结束时间"
                    required
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
                <span className="pane-title-zh">今日回顾</span>
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
                  aria-label="今日完成进度"
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
        </div>
      </motion.div>
    </div>
  );
}
