import type {HTMLAttributes, ReactNode} from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

export function Card({interactive = false, className = '', children, ...rest}: CardProps) {
  return (
    <div
      className={`rounded-lg border border-[#232A3C] bg-[#151923] ${
        interactive
          ? 'transition-colors duration-150 hover:border-[#323C56] hover:bg-[#1B2130]/70'
          : ''
      } ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className = '',
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 border-b border-[#232A3C] px-5 py-3.5 ${className}`}
    >
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-[#F3F4F8]">{title}</h3>
        {subtitle && <p className="mt-0.5 truncate text-xs text-[#9299AA]">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export function CardContent({
  className = '',
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={`p-5 ${className}`}>{children}</div>;
}
