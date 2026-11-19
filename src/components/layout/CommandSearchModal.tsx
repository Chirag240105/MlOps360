import {useEffect, useMemo, useState} from 'react';
import {AnimatePresence, motion} from 'motion/react';
import {ArrowRight, Database, FlaskConical, Layers, Search, X} from 'lucide-react';
import {api} from '../../lib/api';
import {NAV_ITEMS, type NavPageId} from '../../lib/navigation';
import type {DatasetSummary, ExperimentRun, RegisteredModelSummary} from '../../types/api';

interface SearchEntry {
  id: string;
  title: string;
  subtitle: string;
  category: 'Navigation' | 'Dataset' | 'Model' | 'Experiment Run';
  page: NavPageId;
  detailId?: string;
}

export function CommandSearchModal({
  open,
  onClose,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (page: NavPageId, detailId?: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [models, setModels] = useState<RegisteredModelSummary[]>([]);
  const [runs, setRuns] = useState<ExperimentRun[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setLoading(true);
    let active = true;
    Promise.all([
      api.datasets.list().catch(() => ({datasets: []})),
      api.models.list().catch(() => ({models: []})),
      api.experiments.listRuns().catch(() => ({runs: []})),
    ])
      .then(([d, m, r]) => {
        if (!active) return;
        setDatasets(d.datasets ?? []);
        setModels(m.models ?? []);
        setRuns((r.runs ?? []).slice(0, 20));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const entries = useMemo<SearchEntry[]>(() => {
    const items: SearchEntry[] = NAV_ITEMS.map((nav) => ({
      id: `nav:${nav.id}`,
      title: nav.label,
      subtitle: nav.description,
      category: 'Navigation',
      page: nav.id,
    }));

    for (const ds of datasets) {
      items.push({
        id: `ds:${ds.id}`,
        title: ds.name,
        subtitle: ds.latestVersion
          ? `v${ds.latestVersion.versionNumber} · ${ds.latestVersion.rowCount.toLocaleString()} rows · ${ds.latestVersion.scenario}`
          : 'No versions yet',
        category: 'Dataset',
        page: 'datasets',
        detailId: ds.id,
      });
    }

    for (const model of models) {
      items.push({
        id: `model:${model.id}`,
        title: model.name,
        subtitle: `${model.versionCount} version(s) · ${model.productionVersion ? `Prod v${model.productionVersion.versionNumber}` : 'No production version'}`,
        category: 'Model',
        page: 'models',
        detailId: model.id,
      });
    }

    for (const run of runs) {
      items.push({
        id: `run:${run.id}`,
        title: run.mlflowRunId || run.trainingRunId,
        subtitle: `${run.algorithm} · Test RMSE ${run.metrics.test.rmse.toFixed(4)} · ${run.experimentName}`,
        category: 'Experiment Run',
        page: 'experiments',
      });
    }

    return items;
  }, [datasets, models, runs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries.slice(0, 14);
    return entries
      .filter(
        (entry) =>
          entry.title.toLowerCase().includes(q) ||
          entry.subtitle.toLowerCase().includes(q) ||
          entry.category.toLowerCase().includes(q),
      )
      .slice(0, 14);
  }, [entries, query]);

  const iconForCategory = (category: SearchEntry['category']) => {
    if (category === 'Dataset') return <Database className="h-3.5 w-3.5 text-[#6C9EFF]" />;
    if (category === 'Model') return <Layers className="h-3.5 w-3.5 text-[#8B7CFF]" />;
    if (category === 'Experiment Run') return <FlaskConical className="h-3.5 w-3.5 text-[#32C98A]" />;
    return <ArrowRight className="h-3.5 w-3.5 text-[#9299AA]" />;
  };

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]"
          role="dialog"
          aria-modal="true"
          aria-label="Global workspace search"
        >
          <motion.div
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            transition={{duration: 0.14}}
            className="fixed inset-0 bg-[#0B0D12]/80"
            onClick={onClose}
          />
          <motion.div
            initial={{opacity: 0, y: -8, scale: 0.98}}
            animate={{opacity: 1, y: 0, scale: 1}}
            exit={{opacity: 0, y: -8, scale: 0.98}}
            transition={{duration: 0.16, ease: [0.16, 1, 0.3, 1]}}
            className="relative z-10 w-full max-w-xl overflow-hidden rounded-lg border border-[#232A3C] bg-[#151923] shadow-2xl"
          >
            <div className="flex items-center gap-2.5 border-b border-[#232A3C] px-4 py-3">
              <Search className="h-4 w-4 shrink-0 text-[#9299AA]" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search pages, datasets, registered models, or MLflow run IDs..."
                className="w-full bg-transparent text-sm text-[#F3F4F8] placeholder-[#646D82] focus:outline-none"
              />
              <button
                type="button"
                onClick={onClose}
                aria-label="Close search"
                className="rounded p-1 text-[#9299AA] hover:bg-[#1B2130] hover:text-[#F3F4F8]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto p-2">
              {loading && entries.length <= NAV_ITEMS.length && (
                <p className="px-3 py-2 text-xs text-[#646D82]">Syncing workspace index...</p>
              )}
              {filtered.length === 0 ? (
                <p className="px-3 py-8 text-center text-xs text-[#9299AA]">
                  No workspace pages or assets match "{query}".
                </p>
              ) : (
                <div className="space-y-0.5">
                  {filtered.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onNavigate(item.page, item.detailId);
                        onClose();
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-[#1B2130]"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[#232A3C] bg-[#10131B]">
                          {iconForCategory(item.category)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-[#F3F4F8]">{item.title}</p>
                          <p className="truncate text-[11px] text-[#9299AA]">{item.subtitle}</p>
                        </div>
                      </div>
                      <span className="shrink-0 rounded border border-[#232A3C] bg-[#10131B] px-1.5 py-0.5 text-[10px] font-medium text-[#9299AA]">
                        {item.category}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-[#232A3C] bg-[#10131B]/70 px-4 py-2 text-[11px] text-[#646D82]">
              <span>Navigate directly to pages, datasets, or registered models</span>
              <span className="font-mono">ESC to close</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
