import type {SelectHTMLAttributes} from 'react';
import {ChevronDown} from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
  helperText?: string;
}

export function Select({label, options, helperText, className = '', id, ...rest}: SelectProps) {
  const selectId = id || (label ? `select_${label.toLowerCase().replace(/\s+/g, '_')}` : undefined);
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={selectId} className="block text-xs font-medium text-[#9299AA]">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          className={`h-9 w-full appearance-none rounded-md border border-[#232A3C] bg-[#0B0D12] pr-8 pl-3 text-sm text-[#F3F4F8] transition-colors focus:border-[#8B7CFF] focus:outline-none ${className}`}
          {...rest}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-[#151923] text-[#F3F4F8]">
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 h-4 w-4 -translate-y-1/2 text-[#9299AA]" />
      </div>
      {helperText && <p className="text-xs text-[#646D82]">{helperText}</p>}
    </div>
  );
}
