import {Fragment} from 'react';
import {ChevronRight} from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

export function Breadcrumb({items}: {items: BreadcrumbItem[]}) {
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <Fragment key={`${item.label}-${idx}`}>
            {idx > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#646D82]" />}
            {item.onClick && !isLast ? (
              <button
                type="button"
                onClick={item.onClick}
                className="truncate text-[#9299AA] transition-colors hover:text-[#F3F4F8]"
              >
                {item.label}
              </button>
            ) : (
              <span
                className={`truncate ${
                  isLast ? 'font-medium text-[#F3F4F8]' : 'text-[#9299AA]'
                }`}
              >
                {item.label}
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
