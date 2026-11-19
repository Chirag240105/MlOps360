import {useEffect, type ReactNode} from 'react';
import {AnimatePresence, motion} from 'motion/react';
import {AlertTriangle, X} from 'lucide-react';
import {Button} from './Button';

export function Modal({
  open,
  onClose,
  title,
  description,
  maxWidthClass = 'max-w-lg',
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  maxWidthClass?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <motion.div
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            transition={{duration: 0.16}}
            className="fixed inset-0 bg-[#0B0D12]/80"
            onClick={onClose}
          />
          <motion.div
            initial={{opacity: 0, y: 8, scale: 0.98}}
            animate={{opacity: 1, y: 0, scale: 1}}
            exit={{opacity: 0, y: 8, scale: 0.98}}
            transition={{duration: 0.18, ease: [0.16, 1, 0.3, 1]}}
            className={`relative z-10 w-full ${maxWidthClass} rounded-lg border border-[#232A3C] bg-[#151923] shadow-2xl`}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#232A3C] px-5 py-4">
              <div className="min-w-0">
                <h2 id="modal-title" className="text-base font-semibold text-[#F3F4F8]">
                  {title}
                </h2>
                {description && (
                  <p className="mt-1 text-xs leading-relaxed text-[#9299AA]">{description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close modal"
                className="rounded-md p-1 text-[#9299AA] transition-colors hover:bg-[#1B2130] hover:text-[#F3F4F8]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
            {footer && (
              <div className="flex items-center justify-end gap-2.5 border-t border-[#232A3C] bg-[#10131B]/60 px-5 py-3.5">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function ConfirmationDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  variant = 'danger',
  loading = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'primary' | 'danger';
  loading?: boolean;
  children?: ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      maxWidthClass="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 rounded-md p-2 ${
            variant === 'danger'
              ? 'bg-[#F16C78]/15 text-[#F16C78]'
              : 'bg-[#8B7CFF]/15 text-[#8B7CFF]'
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-sm leading-relaxed text-[#9299AA]">{message}</p>
          {children}
        </div>
      </div>
    </Modal>
  );
}
