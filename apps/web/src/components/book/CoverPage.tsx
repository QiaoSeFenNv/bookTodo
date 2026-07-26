import { BookOpen } from "lucide-react";

type CoverPageProps = {
  activeCount: number;
  doneCount: number;
  quote?: string;
  closed?: boolean;
  onOpen?: () => void;
};

export function CoverPage({
  activeCount,
  doneCount,
  quote,
  closed = false,
  onOpen,
}: CoverPageProps) {
  const today = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());

  return (
    <div className={`cover-card${closed ? " closed-face" : ""}`}>
      <div className="eyebrow">Personal Notebook</div>
      <h2>我的待办书</h2>
      <p className="muted">{today}</p>
      <p className="muted" style={{ margin: "18px 0 12px" }}>
        未完成 {activeCount} 项 · 已完成 {doneCount} 项
      </p>
      {quote ? <p className="cover-quote">「{quote}」</p> : null}
      {!closed && onOpen ? (
        <button className="btn primary" type="button" onClick={onOpen}>
          <BookOpen aria-hidden="true" size={18} />
          打开书本
        </button>
      ) : null}
      {closed ? <p className="muted cover-hint">正在为你打开…</p> : null}
    </div>
  );
}
