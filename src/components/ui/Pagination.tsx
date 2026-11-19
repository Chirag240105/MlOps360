import {ChevronLeft, ChevronRight} from 'lucide-react';
import {Button} from './Button';

export function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (nextPage: number) => void;
}) {
  if (totalItems <= pageSize) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(totalItems, page * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#232A3C] px-4 py-3 text-xs text-[#9299AA]">
      <span className="font-mono tabular-nums">
        Showing {start}–{end} of {totalItems}
      </span>
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          icon={<ChevronLeft className="h-3.5 w-3.5" />}
        >
          Previous
        </Button>
        <span className="px-2 font-mono text-xs text-[#F3F4F8] tabular-nums">
          {page} / {totalPages}
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
        >
          <span>Next</span>
          <ChevronRight className="ml-1 inline h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
