import type {ReactNode} from 'react';
import {BarChart3} from 'lucide-react';
import {Card, CardContent, CardHeader} from './Card';
import {SkeletonBlock} from './LoadingSkeleton';

export function ChartContainer({
  title,
  subtitle,
  action,
  loading = false,
  empty = false,
  emptyMessage = 'No telemetry data recorded for this view yet.',
  heightClass = 'h-64',
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  loading?: boolean;
  empty?: boolean;
  emptyMessage?: string;
  heightClass?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} action={action} />
      <CardContent>
        {loading ? (
          <div className={`${heightClass} flex flex-col justify-end gap-3 pt-4`}>
            <div className="flex h-full items-end gap-2">
              {Array.from({length: 10}).map((_, idx) => (
                <SkeletonBlock
                  key={idx}
                  className="flex-1"
                />
              ))}
            </div>
            <SkeletonBlock className="h-3 w-full" />
          </div>
        ) : empty ? (
          <div className={`${heightClass} flex flex-col items-center justify-center text-center`}>
            <BarChart3 className="h-6 w-6 text-[#646D82]" />
            <p className="mt-2.5 max-w-xs text-xs text-[#9299AA]">{emptyMessage}</p>
          </div>
        ) : (
          <div className={`${heightClass} w-full min-w-0`}>{children}</div>
        )}
      </CardContent>
    </Card>
  );
}
