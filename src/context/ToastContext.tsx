import {createContext, useCallback, useContext, useState, type ReactNode} from 'react';
import {AnimatePresence, motion} from 'motion/react';
import {AlertCircle, CheckCircle2, Info, AlertTriangle, X} from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  pushToast: (toast: Omit<ToastItem, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_CONFIG: Record<
  ToastVariant,
  {icon: typeof CheckCircle2; border: string; iconColor: string}
> = {
  success: {
    icon: CheckCircle2,
    border: 'border-[#32C98A]/35',
    iconColor: 'text-[#32C98A]',
  },
  error: {
    icon: AlertCircle,
    border: 'border-[#F16C78]/40',
    iconColor: 'text-[#F16C78]',
  },
  warning: {
    icon: AlertTriangle,
    border: 'border-[#F5B942]/40',
    iconColor: 'text-[#F5B942]',
  },
  info: {
    icon: Info,
    border: 'border-[#6C9EFF]/40',
    iconColor: 'text-[#6C9EFF]',
  },
};

export function ToastProvider({children}: {children: ReactNode}) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (toast: Omit<ToastItem, 'id'>) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-3), {...toast, id}]);
      setTimeout(() => dismiss(id), 4500);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{pushToast}}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-full max-w-sm flex-col gap-2"
      >
        <AnimatePresence>
          {toasts.map((item) => {
            const cfg = VARIANT_CONFIG[item.variant];
            const Icon = cfg.icon;
            return (
              <motion.div
                key={item.id}
                initial={{opacity: 0, y: 12, scale: 0.98}}
                animate={{opacity: 1, y: 0, scale: 1}}
                exit={{opacity: 0, y: 8, scale: 0.98}}
                transition={{duration: 0.18, ease: [0.16, 1, 0.3, 1]}}
                className={`pointer-events-auto flex items-start gap-3 rounded-lg border ${cfg.border} bg-[#1B2130] px-3.5 py-3 shadow-xl`}
              >
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${cfg.iconColor}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#F3F4F8]">{item.title}</p>
                  {item.description && (
                    <p className="mt-0.5 text-xs leading-relaxed text-[#9299AA]">{item.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  aria-label="Dismiss notification"
                  className="rounded p-1 text-[#9299AA] transition-colors hover:bg-[#232A3C] hover:text-[#F3F4F8]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
