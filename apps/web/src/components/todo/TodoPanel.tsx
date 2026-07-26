import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Plus } from "lucide-react";
import type { Todo, TodoFilter } from "../../lib/api";
import { TodoItem } from "./TodoItem";

type TodoPanelProps = {
  title: string;
  subtitle?: string;
  todos: Todo[];
  filter: TodoFilter;
  onFilterChange?: (filter: TodoFilter) => void;
  showComposer?: boolean;
  showFilters?: boolean;
  onCreate?: (title: string) => Promise<boolean> | boolean;
  onToggle: (todo: Todo) => void;
  onRename: (todo: Todo, title: string) => void;
  onDelete: (todo: Todo) => void;
  onSchedule?: (todo: Todo) => void;
  onJumpSchedule?: () => void;
  headerAction?: ReactNode;
  showTimeBadge?: boolean;
};

export function TodoPanel({
  title,
  subtitle,
  todos,
  filter,
  onFilterChange,
  showComposer = false,
  showFilters = false,
  onCreate,
  onToggle,
  onRename,
  onDelete,
  onSchedule,
  onJumpSchedule,
  headerAction,
  showTimeBadge = true,
}: TodoPanelProps) {
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!onCreate || !draft.trim()) return;
    setSubmitting(true);
    try {
      const created = await onCreate(draft.trim());
      if (created) setDraft("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="book-page">
      <div className="page-heading">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p className="muted">{subtitle}</p> : null}
        </div>
        {headerAction}
      </div>

      {showFilters && onFilterChange ? (
        <div className="filters">
          {(
            [
              ["all", "全部"],
              ["active", "未完成"],
              ["done", "已完成"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`chip${filter === value ? " active" : ""}`}
              onClick={() => onFilterChange(value)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {showComposer && onCreate ? (
        <form className="todo-composer" onSubmit={handleCreate}>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="写下一件要做的事..."
            maxLength={200}
          />
          <button className="btn primary" type="submit" disabled={submitting || !draft.trim()}>
            <Plus aria-hidden="true" size={17} />
            添加
          </button>
        </form>
      ) : null}

      {todos.length === 0 ? (
        <div className="empty">这一页还是空白的。</div>
      ) : (
        <ul className="todo-list">
          {todos.map((todo) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              onToggle={onToggle}
              onRename={onRename}
              onDelete={onDelete}
              onSchedule={onSchedule}
              onJumpSchedule={onJumpSchedule}
              showTimeBadge={showTimeBadge}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
