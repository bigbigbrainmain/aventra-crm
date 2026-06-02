import { useState, useEffect, useCallback } from 'react';
import { X, Check, Trash2 } from 'lucide-react';

export default function LeadReviewModal({ leads, onClose, onDiscard }) {
  const [index, setIndex] = useState(0);
  const [kept, setKept] = useState(0);
  const [discarded, setDiscarded] = useState(0);
  const [done, setDone] = useState(false);
  const [exiting, setExiting] = useState(false);

  const current = leads[index];

  const advance = useCallback((action) => {
    if (exiting) return;
    setExiting(true);

    if (action === 'discard') {
      onDiscard(leads[index].id).catch(() => {});
    }

    setTimeout(() => {
      if (action === 'keep') setKept(k => k + 1);
      else setDiscarded(d => d + 1);

      const next = index + 1;
      if (next >= leads.length) {
        setDone(true);
      } else {
        setIndex(next);
        setExiting(false);
      }
    }, 180);
  }, [exiting, index, leads, onDiscard]);

  useEffect(() => {
    function onKey(e) {
      if (done) { if (e.key === 'Escape') onClose(); return; }
      if (e.key === 'ArrowRight' || e.key === 'k' || e.key === 'K') advance('keep');
      else if (e.key === 'ArrowLeft' || e.key === 'd' || e.key === 'D') advance('discard');
      else if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance, done, onClose]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        {done ? (
          <div className="p-8 text-center">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check size={24} className="text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Review complete</h2>
            <p className="text-slate-500 text-sm mb-6">{kept} kept · {discarded} discarded</p>
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="bg-slate-900 px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <button
                    onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(`${current.businessName} ${current.city}`)}`, '_blank')}
                    className="text-white font-bold text-lg hover:text-blue-300 transition-colors text-left leading-tight block"
                  >
                    {current.businessName}
                  </button>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {current.industry && (
                      <span className="text-xs bg-blue-600/30 text-blue-300 px-2 py-0.5 rounded-full">
                        {current.industry}
                      </span>
                    )}
                    {current.city && (
                      <button
                        onClick={() => window.open(`https://www.google.com/maps/search/${encodeURIComponent(current.city)}`, '_blank')}
                        className="text-slate-400 text-xs hover:text-slate-200 transition-colors"
                      >
                        {current.city}
                      </button>
                    )}
                  </div>
                </div>
                <span className="text-slate-400 text-xs shrink-0 pt-1">
                  <span className="text-white font-medium">{index + 1}</span> / {leads.length}
                </span>
              </div>
            </div>

            <div className={`p-5 space-y-3 transition-opacity duration-150 ${exiting ? 'opacity-0' : 'opacity-100'}`}>
              {current.website ? (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 w-14 shrink-0">Website</span>
                  <a
                    href={current.website.startsWith('http') ? current.website : `https://${current.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline truncate"
                  >
                    {current.website.replace(/^https?:\/\//, '')}
                  </a>
                </div>
              ) : null}
              {current.phone ? (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 w-14 shrink-0">Phone</span>
                  <a href={`tel:${current.phone}`} className="text-sm text-slate-700 hover:text-blue-600 transition-colors">
                    {current.phone}
                  </a>
                </div>
              ) : null}
              {current.email ? (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 w-14 shrink-0">Email</span>
                  <a href={`mailto:${current.email}`} className="text-sm text-slate-700 hover:text-blue-600 transition-colors">
                    {current.email}
                  </a>
                </div>
              ) : null}
              {!current.website && !current.phone && !current.email && (
                <p className="text-slate-400 text-sm italic">No contact details found</p>
              )}

              <p className="text-xs text-slate-400 text-right pt-1">
                <kbd className="font-mono">K</kbd> keep · <kbd className="font-mono">D</kbd> discard
              </p>
            </div>

            <div className="flex border-t border-slate-100">
              <button
                onClick={() => advance('discard')}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 text-red-600 hover:bg-red-50 transition-colors font-medium text-sm"
              >
                <Trash2 size={14} />
                Discard
              </button>
              <div className="w-px bg-slate-100" />
              <button
                onClick={() => advance('keep')}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 text-emerald-600 hover:bg-emerald-50 transition-colors font-medium text-sm"
              >
                <Check size={14} />
                Keep
              </button>
            </div>

            <button
              onClick={onClose}
              className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={15} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
