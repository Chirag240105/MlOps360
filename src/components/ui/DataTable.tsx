import {useMemo, useState, type ReactNode} from 'react';
import {ArrowDown, ArrowUp, ArrowUpDown, Search} from 'lucide-react';
import {EmptyState} from './EmptyState';
import {TableSkeleton} from './LoadingSkeleton';
import {Pagination} from './Pagination';

export interface ColumnDef<T> {
  key: string;
  header: string;
  align?: 'left' | 'right';
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
  render: (row: T) => ReactNode;
  widthClass?: string;
}

export function DataTable<T>({
  data,
  columns,
  rowKey,
  loading = false,
  searchable = false,
  searchPlaceholder = 'Filter records...',
  searchText,
  pageSize = 10,
  emptyTitle = 'No records found',
  emptyDescription = 'Adjust filters or trigger an operation to populate this table.',
  emptyAction,
  toolbarRight,
  onRowClick,
}: {
  data: T[];
  columns: ColumnDef<T>[];
  rowKey: (row: T) => string;
  loading?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  searchText?: (row: T) => string;
  pageSize?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  toolbarRight?: ReactNode;
  onRowClick?: (row: T) => void;
}) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !searchable) return data;
    return data.filter((row) => {
      if (searchText) return searchText(row).toLowerCase().includes(q);
      return JSON.stringify(row).toLowerCase().includes(q);
    });
  }, [data, query, searchable, searchText]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    if (!col || !col.sortValue) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va;
      }
      return sortDir === 'asc'
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });
    return copy;
  }, [filtered, sortKey, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleRows = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  const toggleSort = (col: ColumnDef<T>) => {
    if (!col.sortable || !col.sortValue) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(col.key);
      setSortDir('desc');
    }
    setPage(1);
  };

  if (loading) {
    return <TableSkeleton rows={Math.min(6, pageSize)} />;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[#232A3C] bg-[#151923]">
      {(searchable || toolbarRight) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#232A3C] px-4 py-3">
          {searchable ? (
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[#646D82]" />
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder={searchPlaceholder}
                className="h-8 w-full rounded-md border border-[#232A3C] bg-[#0B0D12] pr-3 pl-8 text-xs text-[#F3F4F8] placeholder-[#646D82] focus:border-[#8B7CFF] focus:outline-none"
              />
            </div>
          ) : (
            <div />
          )}
          {toolbarRight && <div className="flex flex-wrap items-center gap-2">{toolbarRight}</div>}
        </div>
      )}

      {visibleRows.length === 0 ? (
        <div className="p-6">
          <EmptyState
            title={emptyTitle}
            description={emptyDescription}
            action={emptyAction}
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[#232A3C] bg-[#10131B]/70 text-[#9299AA]">
                {columns.map((col) => {
                  const isSorted = sortKey === col.key;
                  return (
                    <th
                      key={col.key}
                      className={`px-4 py-2.5 font-medium whitespace-nowrap ${
                        col.align === 'right' ? 'text-right' : 'text-left'
                      } ${col.widthClass ?? ''}`}
                    >
                      {col.sortable && col.sortValue ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(col)}
                          className={`inline-flex items-center gap-1 transition-colors hover:text-[#F3F4F8] ${
                            col.align === 'right' ? 'flex-row-reverse' : ''
                          }`}
                        >
                          <span>{col.header}</span>
                          {isSorted ? (
                            sortDir === 'asc' ? (
                              <ArrowUp className="h-3 w-3 text-[#8B7CFF]" />
                            ) : (
                              <ArrowDown className="h-3 w-3 text-[#8B7CFF]" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-50" />
                          )}
                        </button>
                      ) : (
                        col.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#232A3C]">
              {visibleRows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`h-11 transition-colors ${
                    onRowClick
                      ? 'cursor-pointer hover:bg-[#1B2130]/75'
                      : 'hover:bg-[#1B2130]/40'
                  }`}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-2.5 text-[#F3F4F8] ${
                        col.align === 'right' ? 'text-right tabular-nums' : 'text-left'
                      }`}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={safePage}
        totalPages={totalPages}
        totalItems={sorted.length}
        pageSize={pageSize}
        onPageChange={setPage}
      />
    </div>
  );
}
