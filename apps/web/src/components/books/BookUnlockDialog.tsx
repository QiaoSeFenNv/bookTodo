import { useRef, useState } from "react";
import type { FormEvent, MouseEvent } from "react";
import { Eye, EyeOff, X } from "lucide-react";
import { unlockBook, type Book, type BookSession } from "../../lib/api";
import { useDialogFocus } from "./useDialogFocus";

type BookUnlockDialogProps = {
  accessKey: string;
  book: Book;
  onClose: () => void;
  onUnlocked: (session: BookSession) => void;
  onUnauthorized: () => void;
};

export function BookUnlockDialog({
  accessKey,
  book,
  onClose,
  onUnlocked,
  onUnauthorized,
}: BookUnlockDialogProps) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useDialogFocus(dialogRef, passwordRef, onClose, submitting);

  function handleBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && !submitting) onClose();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!password) return;
    setError("");
    setSubmitting(true);
    try {
      const session = await unlockBook(accessKey, book.id, password);
      setPassword("");
      onUnlocked(session);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "request_failed";
      if (message === "unauthorized") {
        onUnauthorized();
        return;
      }
      setError(
        message === "book_unauthorized"
          ? "书本密码不对，请重新输入。"
          : message === "not_found"
            ? "这本任务书已不存在。"
            : "暂时无法解锁，请稍后重试。",
      );
      passwordRef.current?.focus();
      passwordRef.current?.select();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={handleBackdrop}>
      <section
        ref={dialogRef}
        className="book-dialog unlock-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unlock-book-title"
      >
        <header className="book-dialog-header">
          <div>
            <p className="book-dialog-kicker">Locked volume</p>
            <h2 id="unlock-book-title">解锁“{book.name}”</h2>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="关闭解锁窗口"
            onClick={onClose}
            disabled={submitting}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <form className="book-dialog-form" onSubmit={handleSubmit}>
          <label>
            <span>书本密码</span>
            <span className="password-field">
              <input
                ref={passwordRef}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                maxLength={256}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                aria-label={showPassword ? "隐藏密码" : "显示密码"}
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? (
                  <EyeOff size={17} aria-hidden="true" />
                ) : (
                  <Eye size={17} aria-hidden="true" />
                )}
              </button>
            </span>
          </label>
          {error ? (
            <p className="book-dialog-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="book-dialog-actions">
            <button type="button" className="secondary-btn" onClick={onClose} disabled={submitting}>
              取消
            </button>
            <button type="submit" className="primary-btn" disabled={submitting || !password}>
              {submitting ? "解锁中…" : "打开这本书"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
