import {Fragment} from 'react';
import {AnimatePresence, motion} from 'motion/react';
import {ChevronLeft, ChevronRight, X} from 'lucide-react';
import {Tooltip} from '../ui';
import {NAV_ITEMS, type NavPageId} from '../../lib/navigation';

export function Sidebar({
  activePage,
  collapsed,
  mobileOpen,
  alertCount,
  onNavigate,
  onToggleCollapse,
  onCloseMobile,
}: {
  activePage: NavPageId;
  collapsed: boolean;
  mobileOpen: boolean;
  alertCount: number;
  onNavigate: (page: NavPageId) => void;
  onToggleCollapse: () => void;
  onCloseMobile: () => void;
}) {
  const renderNavContent = (isCollapsed: boolean, isMobile: boolean) => {
    let lastGroup = '';

    return (
      <div className="flex h-full flex-col bg-[#10131B]">
        {/* Brand header */}
        <div
          className={`flex h-14 shrink-0 items-center border-b border-[#232A3C] ${
            isCollapsed ? 'justify-center px-2' : 'justify-between px-4'
          }`}
        >
          <button
            type="button"
            onClick={() => {
              onNavigate('overview');
              if (isMobile) onCloseMobile();
            }}
            className="flex min-w-0 items-center gap-2.5 text-left focus:outline-none"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#8B7CFF]/40 bg-[#8B7CFF]/15 text-[#8B7CFF]">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 3L4 7.5v9L12 21l8-4.5v-9L12 3z" />
                <circle cx="12" cy="12" r="2.5" fill="currentColor" />
              </svg>
            </div>
            {!isCollapsed && (
              <div className="min-w-0">
                <span className="block truncate text-sm font-semibold tracking-tight text-[#F3F4F8]">
                  ModelOps<span className="text-[#8B7CFF]">360</span>
                </span>
              </div>
            )}
          </button>

          {isMobile ? (
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close navigation menu"
              className="rounded-md p-1.5 text-[#9299AA] transition-colors hover:bg-[#1B2130] hover:text-[#F3F4F8]"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            !isCollapsed && (
              <button
                type="button"
                onClick={onToggleCollapse}
                aria-label="Collapse sidebar"
                className="rounded-md p-1 text-[#9299AA] transition-colors hover:bg-[#1B2130] hover:text-[#F3F4F8]"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )
          )}
        </div>

        {/* Navigation links */}
        <nav
          aria-label="Primary Navigation"
          className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-3"
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activePage === item.id;
            const showGroupHeader = !isCollapsed && item.group !== lastGroup;
            lastGroup = item.group;
            const showAlertBadge = item.id === 'drift' && alertCount > 0;

            const buttonEl = (
              <button
                type="button"
                onClick={() => {
                  onNavigate(item.id);
                  if (isMobile) onCloseMobile();
                }}
                aria-current={active ? 'page' : undefined}
                className={`group relative flex w-full items-center rounded-md text-xs font-medium transition-colors duration-150 ${
                  isCollapsed ? 'justify-center px-2 py-2.5' : 'justify-between px-2.5 py-2'
                } ${
                  active
                    ? 'bg-[#8B7CFF]/15 text-[#F3F4F8]'
                    : 'text-[#9299AA] hover:bg-[#1B2130]/70 hover:text-[#F3F4F8]'
                }`}
              >
                {active && (
                  <span
                    className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-r bg-[#8B7CFF]"
                    aria-hidden="true"
                  />
                )}
                <span className={`flex min-w-0 items-center ${isCollapsed ? '' : 'gap-2.5'}`}>
                  <Icon
                    className={`h-4 w-4 shrink-0 transition-colors ${
                      active ? 'text-[#8B7CFF]' : 'text-[#646D82] group-hover:text-[#9299AA]'
                    }`}
                  />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </span>

                {!isCollapsed && showAlertBadge && (
                  <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded bg-[#F16C78]/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#F16C78] tabular-nums">
                    {alertCount}
                  </span>
                )}
                {isCollapsed && showAlertBadge && (
                  <span
                    className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[#F16C78]"
                    aria-label={`${alertCount} unacknowledged alerts`}
                  />
                )}
              </button>
            );

            return (
              <Fragment key={item.id}>
                {showGroupHeader && (
                  <div className="px-2.5 pt-3 pb-1 first:pt-1">
                    <span className="text-[10px] font-semibold tracking-wider text-[#646D82] uppercase">
                      {item.group}
                    </span>
                  </div>
                )}
                {isCollapsed && !isMobile ? (
                  <div className="flex justify-center">
                    <Tooltip label={item.label} side="right">
                      {buttonEl}
                    </Tooltip>
                  </div>
                ) : (
                  buttonEl
                )}
              </Fragment>
            );
          })}
        </nav>

        {/* Bottom collapse trigger when collapsed on desktop */}
        {!isMobile && isCollapsed && (
          <div className="border-t border-[#232A3C] p-2.5 flex justify-center">
            <Tooltip label="Expand sidebar" side="right">
              <button
                type="button"
                onClick={onToggleCollapse}
                aria-label="Expand sidebar"
                className="flex h-8 w-8 items-center justify-center rounded-md text-[#9299AA] transition-colors hover:bg-[#1B2130] hover:text-[#F3F4F8]"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </Tooltip>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Desktop collapsible sidebar */}
      <aside
        className={`hidden shrink-0 border-r border-[#232A3C] transition-[width] duration-200 ease-out lg:block ${
          collapsed ? 'w-[68px]' : 'w-[244px]'
        }`}
      >
        <div className="sticky top-0 h-screen">{renderNavContent(collapsed, false)}</div>
      </aside>

      {/* Mobile slide-over drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <motion.div
              initial={{opacity: 0}}
              animate={{opacity: 1}}
              exit={{opacity: 0}}
              transition={{duration: 0.16}}
              className="fixed inset-0 bg-[#0B0D12]/80"
              onClick={onCloseMobile}
            />
            <motion.aside
              initial={{x: -260}}
              animate={{x: 0}}
              exit={{x: -260}}
              transition={{duration: 0.2, ease: [0.16, 1, 0.3, 1]}}
              className="relative z-10 h-full w-64 border-r border-[#232A3C] bg-[#10131B] shadow-2xl"
            >
              {renderNavContent(false, true)}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
