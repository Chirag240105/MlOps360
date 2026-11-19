import {useEffect, useRef, useState, type ReactNode} from 'react';
import {AnimatePresence, motion} from 'motion/react';

export interface DropdownProps {
  trigger: ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: 'left' | 'right';
  widthClass?: string;
}

export function Dropdown({
  trigger,
  children,
  align = 'right',
  widthClass = 'w-64',
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block text-left">
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{opacity: 0, y: 4, scale: 0.98}}
            animate={{opacity: 1, y: 0, scale: 1}}
            exit={{opacity: 0, y: 4, scale: 0.98}}
            transition={{duration: 0.14, ease: [0.16, 1, 0.3, 1]}}
            className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} z-40 mt-2 ${widthClass} rounded-lg border border-[#232A3C] bg-[#1B2130] p-1.5 shadow-2xl`}
          >
            {typeof children === 'function' ? children(() => setOpen(false)) : children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
