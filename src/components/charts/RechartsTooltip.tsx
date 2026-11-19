export interface TooltipPayloadItem {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string;
}

export function DarkChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
  valueFormatter?: (value: number | string, name: string) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-md border border-[#2A3348] bg-[#1B2130] px-3 py-2 text-xs shadow-xl">
      {label !== undefined && (
        <p className="mb-1.5 font-mono text-[11px] font-medium text-[#9299AA]">{label}</p>
      )}
      <div className="space-y-1">
        {payload.map((entry, idx) => {
          const name = String(entry.name ?? entry.dataKey ?? 'Value');
          const rawVal = entry.value ?? '—';
          const formatted =
            valueFormatter && (typeof rawVal === 'number' || typeof rawVal === 'string')
              ? valueFormatter(rawVal, name)
              : typeof rawVal === 'number'
                ? rawVal.toFixed(4)
                : String(rawVal);

          return (
            <div key={`${name}-${idx}`} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-[#9299AA]">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{backgroundColor: entry.color || '#8B7CFF'}}
                />
                <span>{name}</span>
              </span>
              <span className="font-mono font-medium text-[#F3F4F8] tabular-nums">{formatted}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
