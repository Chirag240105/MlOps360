import type {ReactNode} from 'react';
import type {StatusTone} from '../../lib/format';

const TONE_CLASSES: Record<StatusTone, {container: string; dot: string}> = {
  neutral: {
    container: 'border-[#2B3347] bg-[#1B2130] text-[#9299AA]',
    dot: 'bg-[#9299AA]',
  },
  accent: {
    container: 'border-[#8B7CFF]/35 bg-[#8B7CFF]/12 text-[#BDB5FF]',
    dot: 'bg-[#8B7CFF]',
  },
  info: {
    container: 'border-[#6C9EFF]/35 bg-[#6C9EFF]/12 text-[#9BC0FF]',
    dot: 'bg-[#6C9EFF]',
  },
  success: {
    container: 'border-[#32C98A]/35 bg-[#32C98A]/12 text-[#32C98A]',
    dot: 'bg-[#32C98A]',
  },
  warning: {
    container: 'border-[#F5B942]/35 bg-[#F5B942]/12 text-[#F5B942]',
    dot: 'bg-[#F5B942]',
  },
  error: {
    container: 'border-[#F16C78]/35 bg-[#F16C78]/12 text-[#F16C78]',
    dot: 'bg-[#F16C78]',
  },
};

export function StatusBadge({
  label,
  tone = 'neutral',
  icon,
}: {
  label: string;
  tone?: StatusTone;
  icon?: ReactNode;
}) {
  const styles = TONE_CLASSES[tone];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${styles.container}`}
    >
      {icon ?? <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} aria-hidden="true" />}
      <span>{label}</span>
    </span>
  );
}
