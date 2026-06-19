import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils.js';

/**
 * 传统分页组件
 * @param {number} page - 当前页码 (从 1 开始)
 * @param {number} totalPages - 总页数
 * @param {number} total - 总条数
 * @param {function} onPageChange - 页码变化回调 (page) => void
 */
export default function Pagination({ page, totalPages, total, onPageChange }) {
  if (totalPages <= 1) return null;

  const getVisiblePages = () => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, page - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    start = Math.max(1, end - maxVisible + 1);

    if (start > 1) {
      pages.push(1);
      if (start > 2) pages.push('...');
    }
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    if (end < totalPages) {
      if (end < totalPages - 1) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  const visiblePages = getVisiblePages();

  return (
    <div className="flex items-center justify-center gap-1 pt-4">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] transition-colors',
            page <= 1
              ? 'opacity-40 cursor-not-allowed'
              : 'hover:bg-accent text-muted-foreground hover:text-foreground'
          )}
        >
          <ChevronLeft size={15} />
        </button>

        {visiblePages.map((p, i) =>
          p === '...' ? (
            <span key={`ellipsis-${i}`} className="flex h-8 w-8 items-center justify-center text-muted-foreground text-helper">
              ...
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={cn(
                'flex h-8 min-w-[2rem] items-center justify-center rounded-[var(--radius-md)] px-2 text-[13px] font-medium transition-colors',
                p === page
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] transition-colors',
            page >= totalPages
              ? 'opacity-40 cursor-not-allowed'
              : 'hover:bg-accent text-muted-foreground hover:text-foreground'
          )}
        >
          <ChevronRight size={15} />
        </button>
    </div>
  );
}
