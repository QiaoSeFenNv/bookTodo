import { useRef, useState } from "react";
import type { FormEvent, MouseEvent } from "react";
import { Eye, EyeOff, X } from "lucide-react";
import { deleteBook, updateBook, type Book } from "../../lib/api";
import { useDialogFocus } from "./useDialogFocus";

type ManageBookDialogProps = {
  accessKey: string;
  book: Book;
  onClose: () => void;
  onUpdated: (book: Book) => void;
  onDeleted: (bookId: string) => void;
  onUnauthorized: () => void;
};

export function ManageBookDialog({
  accessKey,
  book,
  onClose,
  onUpdated,
  onDeleted,
  onUnauthorized,
}: ManageBookDialogProps) {
  const [name, setName] = useState(book.name);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const currentPasswordRef = useRef<HTMLInputElement>(null);
  const newPasswordRef = useRef<HTMLInputElement>(null);
  const newPasswordConfirmRef = useRef<HTMLInputElement>(null);
  const deletePasswordRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useDialogFocus(dialogRef, nameRef, onClose, submitting);

  function handleBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && !submitting) onClose();
  }

  function describeError(message: string, fallback: string): string {
    if (message === "book_unauthorized") return "书本密码不对，请重新输入。";
    if (message === "not_found") return "这本任务书已不存在。";
    if (message === "conflict") return "已有同名任务书，请换一个名称。";
    if (message === "invalid_request") return "请检查输入内容。";
    return fallback;
  }

  function handleUnauthorized(message: string): boolean {
    if (message === "unauthorized") {
      onUnauthorized();
      return true;
    }
    return false;
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    const wantsRename = trimmedName !== book.name;
    const wantsPasswordChange = newPassword.length > 0;

    if (!trimmedName) {
      setError("请输入任务书名称。");
      nameRef.current?.focus();
      return;
    }
    if (!wantsRename && !wantsPasswordChange) {
      setError("没有需要保存的修改。");
      return;
    }
    if (!currentPassword) {
      setError("请输入当前书本密码以保存修改。");
      currentPasswordRef.current?.focus();
      return;
    }
    if (wantsPasswordChange) {
      if (newPassword.length < 8) {
        setError("新密码至少需要 8 个字符。");
        newPasswordRef.current?.focus();
        return;
      }
      if (newPassword !== newPasswordConfirm) {
        setError("两次输入的新密码不一致。");
        newPasswordConfirmRef.current?.focus();
        return;
      }
    }

    setError("");
    setSubmitting(true);
    try {
      const updated = await updateBook(accessKey, book.id, {
        currentPassword,
        ...(wantsRename ? { name: trimmedName } : {}),
        ...(wantsPasswordChange ? { newPassword } : {}),
      });
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
      onUpdated(updated);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "request_failed";
      if (handleUnauthorized(message)) return;
      setError(describeError(message, "暂时无法保存修改，请稍后重试。"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(event: FormEvent) {
    event.preventDefault();
    if (!deletePassword) {
      setError("请输入书本密码以确认删除。");
      deletePasswordRef.current?.focus();
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      await deleteBook(accessKey, book.id, deletePassword);
      setDeletePassword("");
      onDeleted(book.id);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "request_failed";
      if (handleUnauthorized(message)) return;
      setError(describeError(message, "暂时无法删除任务书，请稍后重试。"));
      deletePasswordRef.current?.focus();
      deletePasswordRef.current?.select();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={handleBackdrop}>
      <section
        ref={dialogRef}
        className="book-dialog manage-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-book-title"
      >
        <header className="book-dialog-header">
          <div>
            <p className="book-dialog-kicker">Manage volume</p>
            <h2 id="manage-book-title">管理“{book.name}”</h2>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="关闭管理窗口"
            onClick={onClose}
            disabled={submitting}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <form className="book-dialog-form" onSubmit={handleSave}>
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
            <span>新密码（留空则不修改）</span>
            <span className="password-field">
              <input
                ref={newPasswordRef}
                type={showPasswords ? "text" : "password"}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
              />
              <button
                type="button"
                aria-label={showPasswords ? "隐藏密码" : "显示密码"}
                onClick={() => setShowPasswords((current) => !current)}
              >
                {showPasswords ? (
                  <EyeOff size={17} aria-hidden="true" />
                ) : (
                  <Eye size={17} aria-hidden="true" />
                )}
              </button>
            </span>
          </label>
          {newPassword ? (
            <label>
              <span>确认新密码</span>
              <input
                ref={newPasswordConfirmRef}
                type={showPasswords ? "text" : "password"}
                value={newPasswordConfirm}
                onChange={(event) => setNewPasswordConfirm(event.target.value)}
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
              />
            </label>
          ) : null}
          <label>
            <span>当前书本密码（保存修改必填）</span>
            <input
              ref={currentPasswordRef}
              type={showPasswords ? "text" : "password"}
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              maxLength={256}
              autoComplete="current-password"
            />
          </label>
          <div className="book-dialog-actions">
            <button type="submit" className="primary-btn" disabled={submitting}>
              {submitting ? "保存中…" : "保存修改"}
            </button>
          </div>
        </form>

        <div className="book-danger-zone">
          {confirmingDelete ? (
            <form className="book-dialog-form" onSubmit={handleDelete}>
              <p className="book-danger-hint">
                删除后，这本书里的所有待办和日记都会被清除，且无法恢复。
              </p>
              <label>
                <span>输入书本密码以确认删除</span>
                <input
                  ref={deletePasswordRef}
                  type={showPasswords ? "text" : "password"}
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                  maxLength={256}
                  autoComplete="current-password"
                  required
                />
              </label>
              <div className="book-dialog-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => {
                    setConfirmingDelete(false);
                    setDeletePassword("");
                    setError("");
                  }}
                  disabled={submitting}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="danger-btn"
                  disabled={submitting || !deletePassword}
                >
                  {submitting ? "删除中…" : "确认删除"}
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              className="danger-btn"
              onClick={() => {
                setConfirmingDelete(true);
                setError("");
                requestAnimationFrame(() => deletePasswordRef.current?.focus());
              }}
              disabled={submitting}
            >
              删除这本任务书…
            </button>
          )}
        </div>

        {error ? (
          <p className="book-dialog-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}
