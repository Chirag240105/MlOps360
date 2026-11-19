import type {InputHTMLAttributes, ReactNode, TextareaHTMLAttributes} from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  leftIcon?: ReactNode;
}

export function Input({
  label,
  helperText,
  error,
  leftIcon,
  className = '',
  id,
  ...rest
}: InputProps) {
  const inputId = id || (label ? `input_${label.toLowerCase().replace(/\s+/g, '_')}` : undefined);

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-[#9299AA]">
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#646D82]">
            {leftIcon}
          </span>
        )}
        <input
          id={inputId}
          className={`h-9 w-full rounded-md border bg-[#0B0D12] text-sm text-[#F3F4F8] placeholder-[#646D82] transition-colors focus:border-[#8B7CFF] focus:outline-none ${
            leftIcon ? 'pr-3 pl-9' : 'px-3'
          } ${error ? 'border-[#F16C78]' : 'border-[#232A3C]'} ${className}`}
          {...rest}
        />
      </div>
      {error && <p className="text-xs text-[#F16C78]">{error}</p>}
      {!error && helperText && <p className="text-xs text-[#646D82]">{helperText}</p>}
    </div>
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
  error?: string;
}

export function Textarea({
  label,
  helperText,
  error,
  className = '',
  id,
  ...rest
}: TextareaProps) {
  const areaId = id || (label ? `textarea_${label.toLowerCase().replace(/\s+/g, '_')}` : undefined);
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={areaId} className="block text-xs font-medium text-[#9299AA]">
          {label}
        </label>
      )}
      <textarea
        id={areaId}
        className={`w-full rounded-md border bg-[#0B0D12] p-3 text-sm text-[#F3F4F8] placeholder-[#646D82] transition-colors focus:border-[#8B7CFF] focus:outline-none ${
          error ? 'border-[#F16C78]' : 'border-[#232A3C]'
        } ${className}`}
        {...rest}
      />
      {error && <p className="text-xs text-[#F16C78]">{error}</p>}
      {!error && helperText && <p className="text-xs text-[#646D82]">{helperText}</p>}
    </div>
  );
}
