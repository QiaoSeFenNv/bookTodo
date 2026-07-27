import { useRef, useState } from "react";
import type { FormEvent, MouseEvent } from "react";
import { Eye, EyeOff, X } from "lucide-react";
import { createBook, type Book } from "../../lib/api";
import { useDialogFocus } from "./useDialogFocus";

type CreateBookDialogProps = {
  accessKey: string;
  onClose: () => void;
  onCreated: (book: Book) => void;
  onUnauthorized: () => void;
};

export function CreateBookDialog({
  accessKey,
  onClose,
  onCreated,
  onUnauthorized,
}: CreateBookDialogProps) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useDialogFocus(dialogRef, nameRef, onClose, submitting);

  function handleBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && !submitting) onClose();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("请输入任务书名称。");
      nameRef.current?.focus();
      return;
    }
    if (password.length < 8) {
      setError("书本密码至少需要 8 个字符。");
      passwordRef.current?.focus();
      return;
    }
    if (password !== confirmation) {
      setError("两次输入的书本密码不一致。");
      confirmationRef.current?.focus();
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      const book = await createBook(accessKey, { name: trimmedName, password });
      setPassword("");
      setConfirmation("");
      onCreated(book);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "request_failed";
      if (message === "unauthorized") {
        onUnauthorized();
        return;
      }
      setError(
        message === "conflict"
          ? "已有同名任务书，请换一个名称。"
          : "暂时无法创建任务书，请稍后重试。",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={handleBackdrop}>
      <section
        ref={dialogRef}
        className="book-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-book-title"
      >
        <header className="book-dialog-header">
          <div>
            <p className="book-dialog-kicker">New volume</p>
            <h2 id="create-book-title">创建任务书</h2>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="关闭创建窗口"
            onClick={onClose}
            disabled={submitting}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <form className="book-dialog-form" onSubmit={handleSubmit}>
          <label>
            <span>任务书名称</span>
            <input
              ref={nameRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              autoComplete="off"
              required
            />
          </label>
          <label>
            <span>书本密码</span>
            <span className="password-field">
              <input
                ref={passwordRef}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
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
          <label>
            <span>确认书本密码</span>
            <input
              ref={confirmationRef}
              type={showPassword ? "text" : "password"}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              required
            />
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
            <button type="submit" className="primary-btn" disabled={submitting}>
              {submitting ? "创建中…" : "创建"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
