import type {ReactNode} from 'react';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  icon?: ReactNode;
}

export function Tabs({
  items,
  activeId,
  onChange,
  variant = 'segmented',
}: {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  variant?: 'segmented' | 'underline';
}) {
  if (variant === 'underline') {
    return (
      <div className="flex items-center gap-1 overflow-x-auto border-b border-[#232A3C]">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                active
                  ? 'border-[#8B7CFF] text-[#F3F4F8]'
                  : 'border-transparent text-[#9299AA] hover:text-[#F3F4F8]'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.count !== undefined && (
                <span className="font-mono text-xs text-[#646D82] tabular-nums">{item.count}</span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-md border border-[#232A3C] bg-[#10131B] p-1">
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
              active
                ? 'bg-[#1B2130] text-[#F3F4F8]'
                : 'text-[#9299AA] hover:text-[#F3F4F8]'
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.count !== undefined && (
              <span className="font-mono text-[11px] text-[#646D82] tabular-nums">{item.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
