import {useState, type ReactNode} from 'react';

export function Tooltip({
  label,
  side = 'right',
  children,
}: {
  label: string;
  side?: 'top' | 'right' | 'bottom';
  children: ReactNode;
}) {
  const [visible, setVisible] = useState(false);

  const posClasses =
    side === 'right'
      ? 'left-full top-1/2 -translate-y-1/2 ml-2'
      : side === 'bottom'
        ? 'top-full left-1/2 -translate-x-1/2 mt-1.5'
        : 'bottom-full left-1/2 -translate-x-1/2 mb-1.5';

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          className={`pointer-events-none absolute z-50 rounded-md border border-[#2A3348] bg-[#1B2130] px-2.5 py-1 text-xs font-medium whitespace-nowrap text-[#F3F4F8] shadow-lg ${posClasses}`}
        >
          {label}
        </span>
      )}
    </div>
  );
}
