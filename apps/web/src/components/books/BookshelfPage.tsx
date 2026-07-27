import { useCallback, useEffect, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, LogOut, Plus, RefreshCw } from "lucide-react";
import { BookUnlockDialog } from "./BookUnlockDialog";
import { CreateBookDialog } from "./CreateBookDialog";
import { listBooks, type Book, type BookPage, type BookSession } from "../../lib/api";

const PAGE_SIZE = 12;

type BookshelfPageProps = {
  accessKey: string;
  onBookUnlocked: (session: BookSession) => void;
  onLogout: () => void;
};

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export function BookshelfPage({ accessKey, onBookUnlocked, onLogout }: BookshelfPageProps) {
  const [page, setPage] = useState(1);
  const [books, setBooks] = useState<BookPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);

  const loadPage = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      setError("");
      try {
        const result = await listBooks(accessKey, targetPage, PAGE_SIZE);
        setBooks(result);
        setPage(result.page);
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "request_failed";
        if (message === "unauthorized") {
          onLogout();
          return;
        }
        setError("书架暂时没有打开，请稍后重试。");
      } finally {
        setLoading(false);
      }
    },
    [accessKey, onLogout],
  );

  useEffect(() => {
    void loadPage(page);
  }, [loadPage, page]);

  return (
    <main className="bookshelf-page">
      <div className="bookshelf-shell">
        <header className="bookshelf-header">
          <div>
            <p className="bookshelf-kicker">Private library</p>
            <h1>任务书架</h1>
            <p className="bookshelf-count">{books ? `共 ${books.totalItems} 本` : "正在清点…"}</p>
          </div>
          <div className="bookshelf-actions">
            <button type="button" className="primary-btn" onClick={() => setCreateOpen(true)}>
              <Plus size={17} aria-hidden="true" />
              创建任务书
            </button>
            <button type="button" className="secondary-btn" onClick={onLogout}>
              <LogOut size={16} aria-hidden="true" />
              退出书房
            </button>
          </div>
        </header>

        {error ? (
          <div className="bookshelf-state bookshelf-error" role="alert">
            <p>{error}</p>
            <button type="button" className="secondary-btn" onClick={() => void loadPage(page)}>
              <RefreshCw size={16} aria-hidden="true" />
              重试
            </button>
          </div>
        ) : loading ? (
          <div className="bookshelf-state" role="status">正在整理书架…</div>
        ) : books && books.items.length > 0 ? (
          <ul className="bookshelf-grid" aria-label="任务书列表" data-page={books.page}>
            {books.items.map((book, index) => (
              <li key={book.id} style={{ "--book-index": index } as React.CSSProperties}>
                <button
                  type="button"
                  className="book-tile"
                  aria-label={book.name}
                  onClick={() => setSelectedBook(book)}
                >
                  <span className="book-tile-spine" aria-hidden="true" />
                  <span className="book-tile-icon" aria-hidden="true">
                    <BookOpen size={21} />
                  </span>
                  <strong>{book.name}</strong>
                  <time dateTime={book.createdAt}>{dateFormatter.format(new Date(book.createdAt))}</time>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="bookshelf-state">书架还是空的。</div>
        )}

        <nav className="bookshelf-pagination" aria-label="书架分页">
          <button
            type="button"
            className="icon-btn"
            aria-label="上一页"
            disabled={loading || page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            <ChevronLeft size={19} aria-hidden="true" />
          </button>
          <span aria-live="polite">
            第 {page} / {Math.max(books?.totalPages ?? 0, 1)} 页
          </span>
          <button
            type="button"
            className="icon-btn"
            aria-label="下一页"
            disabled={loading || !books || page >= books.totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            <ChevronRight size={19} aria-hidden="true" />
          </button>
        </nav>
      </div>

      {createOpen ? (
        <CreateBookDialog
          accessKey={accessKey}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            setPage(1);
            void loadPage(1);
          }}
          onUnauthorized={onLogout}
        />
      ) : null}

      {selectedBook ? (
        <BookUnlockDialog
          accessKey={accessKey}
          book={selectedBook}
          onClose={() => setSelectedBook(null)}
          onUnlocked={(session) => {
            setSelectedBook(null);
            onBookUnlocked(session);
          }}
          onUnauthorized={onLogout}
        />
      ) : null}
    </main>
  );
}
