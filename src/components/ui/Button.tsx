import type {ButtonHTMLAttributes, ReactNode} from 'react';
import {Loader2} from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-[#8B7CFF] text-[#0B0D12] font-semibold hover:bg-[#9D90FF] active:bg-[#7A6AEF] border border-transparent',
  secondary:
    'bg-[#1B2130] text-[#F3F4F8] font-medium hover:bg-[#232B3E] border border-[#2A3348]',
  ghost:
    'bg-transparent text-[#9299AA] font-medium hover:bg-[#1B2130] hover:text-[#F3F4F8] border border-transparent',
  danger:
    'bg-[#F16C78]/15 text-[#F16C78] font-medium hover:bg-[#F16C78]/25 border border-[#F16C78]/35',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex shrink-0 items-center justify-center rounded-md whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8B7CFF] disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      <span>{children}</span>
    </button>
  );
}
