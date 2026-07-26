import type { Todo } from "../../lib/api";
import { Check, Trash2 } from "lucide-react";
import { formatRange } from "../../lib/time";

type TodoItemProps = {
  todo: Todo;
  onToggle: (todo: Todo) => void;
  onRename: (todo: Todo, title: string) => void;
  onDelete: (todo: Todo) => void;
  showTimeBadge?: boolean;
  onSchedule?: (todo: Todo) => void;
  onJumpSchedule?: () => void;
};

export function TodoItem({
  todo,
  onToggle,
  onRename,
  onDelete,
  showTimeBadge = true,
  onSchedule,
  onJumpSchedule,
}: TodoItemProps) {
  const range = formatRange(todo.scheduledStart, todo.scheduledEnd);

  return (
    <li className={`todo-item${todo.isDone ? " done" : ""}`}>
      <button
        className="check"
        type="button"
        data-checked={todo.isDone}
        aria-label={todo.isDone ? "标记为未完成" : "标记为完成"}
        onClick={() => onToggle(todo)}
      >
        {todo.isDone ? <Check aria-hidden="true" size={14} /> : null}
      </button>
      <div className="todo-main">
        {showTimeBadge && range ? (
          <button
            type="button"
            className="time-badge"
            onClick={() => onJumpSchedule?.()}
            title="查看日程"
          >
            {range}
          </button>
        ) : null}
        <input
          className="todo-title"
          defaultValue={todo.title}
          key={`${todo.id}-${todo.title}`}
          onBlur={(event) => {
            const next = event.target.value.trim();
            if (!next) {
              event.target.value = todo.title;
              return;
            }
            if (next !== todo.title) {
              onRename(todo, next);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
        />
        {onSchedule && !range ? (
          <button type="button" className="text-link" onClick={() => onSchedule(todo)}>
            安排到日程
          </button>
        ) : null}
      </div>
      <button
        className="icon-btn danger"
        type="button"
        aria-label="删除"
        title="删除"
        onClick={() => onDelete(todo)}
      >
        <Trash2 aria-hidden="true" size={17} />
      </button>
    </li>
  );
}
