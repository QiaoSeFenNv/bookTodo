import type { Todo } from "../../lib/api";
import { formatRange } from "../../lib/time";
import { TodoItem } from "./TodoItem";
import { TimeBlockForm } from "./TimeBlockForm";

type SchedulePanelProps = {
  title?: string;
  subtitle?: string;
  todos: Todo[];
  onCreate: (input: {
    title: string;
    scheduledStart: string;
    scheduledEnd: string;
  }) => Promise<boolean> | boolean;
  onToggle: (todo: Todo) => void;
  onRename: (todo: Todo, title: string) => void;
  onDelete: (todo: Todo) => void;
  onJumpOutline?: () => void;
};

export function SchedulePanel({
  title = "今日日程",
  subtitle = "用自由时间块安排这一天。",
  todos,
  onCreate,
  onToggle,
  onRename,
  onDelete,
  onJumpOutline,
}: SchedulePanelProps) {
  const scheduled = [...todos]
    .filter((todo) => todo.scheduledStart && todo.scheduledEnd)
    .sort((a, b) => (a.scheduledStart! > b.scheduledStart! ? 1 : -1));

  return (
    <section className="book-page">
      <div className="page-heading">
        <div>
          <h2>{title}</h2>
          <p className="muted">{subtitle}</p>
        </div>
        {onJumpOutline ? (
          <button type="button" className="chip" onClick={onJumpOutline}>
            去大纲
          </button>
        ) : null}
      </div>

      <TimeBlockForm onSubmit={onCreate} />

      {scheduled.length === 0 ? (
        <div className="empty">添加一个时间块，例如 09:00–11:00 深度工作。</div>
      ) : (
        <ul className="todo-list schedule-list">
          {scheduled.map((todo) => (
            <li key={todo.id} className="schedule-block">
              <div className="schedule-time">
                {formatRange(todo.scheduledStart, todo.scheduledEnd)}
              </div>
              <TodoItem
                todo={todo}
                onToggle={onToggle}
                onRename={onRename}
                onDelete={onDelete}
                showTimeBadge={false}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
