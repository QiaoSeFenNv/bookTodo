import { useState } from "react";
import type { FormEvent } from "react";
import { isValidTimeRange } from "../../lib/time";

type TimeBlockFormProps = {
  onSubmit: (input: {
    title: string;
    scheduledStart: string;
    scheduledEnd: string;
  }) => Promise<boolean> | boolean;
  initialTitle?: string;
  initialStart?: string;
  initialEnd?: string;
  submitLabel?: string;
};

export function TimeBlockForm({
  onSubmit,
  initialTitle = "",
  initialStart = "09:00",
  initialEnd = "10:00",
  submitLabel = "添加时间块",
}: TimeBlockFormProps) {
  const [title, setTitle] = useState(initialTitle);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!title.trim()) {
      setError("请填写标题。");
      return;
    }
    if (!isValidTimeRange(start, end)) {
      setError("结束时间需晚于开始时间。");
      return;
    }
    setSubmitting(true);
    try {
      const ok = await onSubmit({
        title: title.trim(),
        scheduledStart: start,
        scheduledEnd: end,
      });
      if (ok) {
        setTitle("");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="time-block-form" onSubmit={handleSubmit}>
      <div className="time-row">
        <label>
          <span>开始</span>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
        </label>
        <label>
          <span>结束</span>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
        </label>
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="例如：深度工作"
        maxLength={200}
      />
      {error ? <p className="error">{error}</p> : null}
      <button className="btn primary" type="submit" disabled={submitting || !title.trim()}>
        {submitting ? "保存中..." : submitLabel}
      </button>
    </form>
  );
}
