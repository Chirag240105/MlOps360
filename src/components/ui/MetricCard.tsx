import type {ReactNode} from 'react';
import type {StatusTone} from '../../lib/format';

const VALUE_TONES: Record<StatusTone, string> = {
  neutral: 'text-[#F3F4F8]',
  accent: 'text-[#8B7CFF]',
  info: 'text-[#6C9EFF]',
  success: 'text-[#32C98A]',
  warning: 'text-[#F5B942]',
  error: 'text-[#F16C78]',
};

export function MetricCard({
  label,
  value,
  subtext,
  tone = 'neutral',
  icon,
  onClick,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  tone?: StatusTone;
  icon?: ReactNode;
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`flex w-full flex-col justify-between rounded-lg border border-[#232A3C] bg-[#151923] p-4 text-left ${
        onClick
          ? 'cursor-pointer transition-colors duration-150 hover:border-[#323C56] hover:bg-[#1B2130]'
          : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-[#9299AA]">{label}</span>
        {icon && <span className="shrink-0 text-[#646D82]">{icon}</span>}
      </div>
      <div className={`mt-2.5 font-mono text-2xl font-semibold tracking-tight tabular-nums ${VALUE_TONES[tone]}`}>
        {value}
      </div>
      {subtext && <p className="mt-1.5 truncate text-xs text-[#646D82]">{subtext}</p>}
    </Tag>
  );
}
