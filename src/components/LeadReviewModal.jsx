import { useState, useEffect, useRef } from 'react';
import { Check, Trash2, ExternalLink, Globe, Phone, MapPin, Loader2, CheckCircle2, X } from 'lucide-react';
import { api } from '../utils/api';

const TIMER_SECS = 15;

export default function LeadReviewModal({ leads, onClose }) {
  const [index, setIndex] = useState(0);
  const [kept, setKept] = useState(0);
  const [discarded, setDiscarded] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TIMER_SECS);
  const [animDir, setAnimDir] = useState(null); // 'keep' | 'discard'
  const [isDeleting, setIsDeleting] = useState(false);

  const isDone = index >= leads.length;
  const current = !isDone ? leads[index] : null;

  // Stable refs so keyboard/timer callbacks always see latest state
  const stateRef = useRef({});
  stateRef.current = { index, animDir, isDeleting, isDone };

  function advance(dir) {
    setAnimDir(dir);
    setTimeout(() => {
      setIndex(i => i + 1);
      setAnimDir(null);
      setTimeLeft(TIMER_SECS);
    }, 240);
  }

  function handleKeep() {
    const s = stateRef.current;
    if (s.animDir || s.isDone) return;
    setKept(k => k + 1);
    advance('keep');
  }

  async function handleDiscard() {
    const s = stateRef.current;
    if (s.animDir || s.isDeleting || s.isDone) return;
    const lead = leads[s.index];
    setIsDeleting(true);
    try { await api.deleteLead(lead.id); } catch { /* swallow — lead was already added */ }
    setIsDeleting(false);
    setDiscarded(d => d + 1);
    advance('discard');
  }

  // Countdown — pauses during animation
  useEffect(() => {
    if (isDone || animDir) return;
    if (timeLeft <= 0) { handleKeep(); return; }
    const t = setTimeout(() => setTimeLeft(p => p - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, isDone, animDir]);

  // Keyboard shortcuts — use refs to avoid stale closures
  const keepRef = useRef(null);
  const discardRef = useRef(null);
  keepRef.current = handleKeep;
  discardRef.current = handleDiscard;

  useEffect(() => {
    function handler(e) {
      if (e.key === 'ArrowRight' || e.key === 'k' || e.key === 'K') keepRef.current();
      if (e.key === 'ArrowLeft'  || e.key === 'd' || e.key === 'D') discardRef.current();
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const timerPct = (timeLeft / TIMER_SECS) * 100;
  const timerColour = timeLeft <= 3 ? 'bg-red-400' : timeLeft <= 7 ? 'bg-amber-400' : 'bg-emerald-400';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="w-full max-w-md" onClick={e => e.stopPropagation()}>

        {isDone ? (
          /* ── Completion screen ── */
          <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={30} className="text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Review complete</h2>
            <p className="text-slate-500 text-sm mb-6">
              {kept} lead{kept !== 1 ? 's' : ''} kept &middot; {discarded} discarded
            </p>
            <button
              onClick={onClose}
              className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* ── Header row ── */}
            <div className="flex items-center justify-between text-sm text-white/80 mb-3 px-1">
              <span className="font-medium">{index + 1} of {leads.length}</span>
              <div className="flex items-center gap-2">
                <span className={`font-mono font-bold tabular-nums ${timeLeft <= 3 ? 'text-red-400' : timeLeft <= 7 ? 'text-amber-400' : 'text-white/80'}`}>
                  {timeLeft}s
                </span>
                <span className="text-white/50 text-xs">auto-keep</span>
                <button onClick={onClose} className="ml-2 text-white/50 hover:text-white transition-colors">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* ── Timer bar ── */}
            <div className="w-full h-1 bg-white/20 rounded-full mb-3 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ease-linear ${timerColour}`}
                style={{ width: `${timerPct}%` }}
              />
            </div>

            {/* ── Flashcard ── */}
            <div
              className={`bg-white rounded-2xl shadow-2xl overflow-hidden transition-all duration-[240ms]
                ${animDir === 'keep'    ? 'translate-x-16 opacity-0' : ''}
                ${animDir === 'discard' ? '-translate-x-16 opacity-0' : ''}
              `}
            >
              {/* Dark header with name + meta */}
              <div className="bg-slate-900 px-6 pt-5 pb-4">
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(`${current.name} ${current.city}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-start gap-2"
                  onClick={e => e.stopPropagation()}
                >
                  <h2 className="text-xl font-bold text-white group-hover:text-blue-300 transition-colors leading-tight">
                    {current.name}
                  </h2>
                  <ExternalLink size={13} className="text-white/40 group-hover:text-blue-300 shrink-0 mt-1 transition-colors" />
                </a>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/70">
                    {current.industry}
                  </span>
                  <a
                    href={`https://www.google.com/maps/search/${encodeURIComponent(`${current.name} ${current.city}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="flex items-center gap-1 text-xs text-white/60 hover:text-white transition-colors"
                  >
                    <MapPin size={10} />
                    {current.city}
                  </a>
                </div>
              </div>

              {/* Details */}
              <div className="px-6 py-4 space-y-3 border-b border-slate-100">
                {current.website ? (
                  <a
                    href={current.website.startsWith('http') ? current.website : `https://${current.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="flex items-center gap-2.5 text-sm text-blue-600 hover:text-blue-800 transition-colors group"
                  >
                    <Globe size={14} className="shrink-0 text-slate-400 group-hover:text-blue-600 transition-colors" />
                    <span className="truncate">{current.website.replace(/^https?:\/\//, '')}</span>
                    <ExternalLink size={11} className="shrink-0 text-slate-300 group-hover:text-blue-400 transition-colors" />
                  </a>
                ) : (
                  <div className="flex items-center gap-2.5 text-sm text-slate-400">
                    <Globe size={14} className="shrink-0" />
                    <span>No website</span>
                  </div>
                )}

                {current.phone ? (
                  <a
                    href={`tel:${current.phone}`}
                    onClick={e => e.stopPropagation()}
                    className="flex items-center gap-2.5 text-sm text-slate-700 hover:text-slate-900 transition-colors group"
                  >
                    <Phone size={14} className="shrink-0 text-slate-400 group-hover:text-slate-700 transition-colors" />
                    <span>{current.phone}</span>
                  </a>
                ) : (
                  <div className="flex items-center gap-2.5 text-sm text-slate-400">
                    <Phone size={14} className="shrink-0" />
                    <span>No phone listed</span>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 p-4">
                <button
                  onClick={handleDiscard}
                  disabled={!!animDir || isDeleting}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm
                    bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors
                    disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isDeleting
                    ? <Loader2 size={14} className="animate-spin" />
                    : <Trash2 size={14} />
                  }
                  Discard
                </button>
                <button
                  onClick={handleKeep}
                  disabled={!!animDir}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm
                    bg-green-600 text-white hover:bg-green-700 transition-colors
                    disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Check size={14} />
                  Keep
                </button>
              </div>

              {/* Keyboard hint */}
              <div className="flex justify-center gap-6 pb-4 text-xs text-slate-400">
                <span>← D  discard</span>
                <span>keep  K →</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
