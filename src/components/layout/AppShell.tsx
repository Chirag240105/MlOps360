import {useEffect, useState, type ReactNode} from 'react';
import {AnimatePresence, motion} from 'motion/react';
import type {NavPageId, RouteState} from '../../lib/navigation';
import {AuthModal} from './AuthModal';
import {CommandSearchModal} from './CommandSearchModal';
import {Sidebar} from './Sidebar';
import {TopNav} from './TopNav';
import {useWorkspace} from '../../context/WorkspaceContext';

const SIDEBAR_STORAGE_KEY = 'modelops360_sidebar_collapsed';

export function AppShell({
  route,
  onNavigate,
  children,
}: {
  route: RouteState;
  onNavigate: (page: NavPageId, detailId?: string) => void;
  children: ReactNode;
}) {
  const {unacknowledgedAlerts} = useWorkspace();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage failures
      }
      return next;
    });
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="flex min-h-screen bg-[#0B0D12] text-[#F3F4F8]">
      <Sidebar
        activePage={route.page}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        alertCount={unacknowledgedAlerts.length}
        onNavigate={(page) => onNavigate(page)}
        onToggleCollapse={toggleCollapse}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav
          route={route}
          onNavigate={onNavigate}
          onOpenMobileMenu={() => setMobileOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
        />

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1440px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={`${route.page}:${route.detailId ?? ''}`}
                initial={{opacity: 0, y: 6}}
                animate={{opacity: 1, y: 0}}
                exit={{opacity: 0, y: -4}}
                transition={{duration: 0.16, ease: [0.16, 1, 0.3, 1]}}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      <CommandSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onNavigate={onNavigate}
      />
      <AuthModal />
    </div>
  );
}
