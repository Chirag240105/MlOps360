import type {ReactNode} from 'react';
import {Inbox} from 'lucide-react';

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[#2A3348] bg-[#151923]/60 px-6 py-12 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#232A3C] bg-[#1B2130] text-[#9299AA]">
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <h4 className="mt-4 text-sm font-semibold text-[#F3F4F8]">{title}</h4>
      <p className="mt-1.5 max-w-md text-xs leading-relaxed text-[#9299AA]">{description}</p>
      {action && <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">{action}</div>}
    </div>
  );
}
