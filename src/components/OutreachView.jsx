import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Search, Mail, Phone, CheckCircle, XCircle, Clock,
  Filter, PhoneCall, AlertCircle, Loader2, Check,
  SendHorizontal, Sparkles, ChevronLeft, RefreshCw,
} from 'lucide-react';
import { timeAgo, getStatusStyle, getPriorityStyle } from '../utils/constants';
import { api } from '../utils/api';

const PRIORITY_ORDER = { '🔴 Priority 1': 0, '🟠 Priority 2': 1, '🟡 Priority 3': 2, '🟢 Skip': 3 };
const DEAD_STATUSES = new Set(['Lost', 'Qualified Out', 'Closed Won', 'NRTB', 'Incorrect Product Fit']);
const FOLLOWUP_DAYS = 5;

function daysSince(iso) {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso)) / 86400000);
}

function outreachState(lead) {
  if (lead.emailOpenedAt) {
    const d = daysSince(lead.emailOpenedAt);
    if (d <= 2) return { type: 'hot',     label: `Opened ${timeAgo(lead.emailOpenedAt)} — call them today!`,  cls: 'text-orange-700 bg-orange-50 border-orange-200' };
    return         { type: 'opened',  label: `Opened ${timeAgo(lead.emailOpenedAt)}`,                         cls: 'text-green-700 bg-green-50 border-green-200'   };
  }
  const d = daysSince(lead.lastOutreachAt);
  if (d >= 3 && lead.outreachCount === 1) return { type: 'followup', label: `Day ${d} with no reply — follow up?`,     cls: 'text-amber-700 bg-amber-50 border-amber-200'   };
  if (lead.outreachCount >= 2)            return { type: 'silent',   label: `Follow-up sent · still no response`,      cls: 'text-slate-500 bg-slate-50 border-slate-200'   };
  return                                         { type: 'waiting',  label: `Sent ${timeAgo(lead.lastOutreachAt)} · awaiting response`, cls: 'text-slate-400 bg-slate-50 border-slate-100' };
}

function PriorityPip({ priority }) {
  const p = getPriorityStyle(priority);
  if (!p) return null;
  return <span className={`w-2 h-2 rounded-full shrink-0 ${p.dot}`} />;
}

function StatusBadge({ status }) {
  const s = getStatusStyle(status);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      {status}
    </span>
  );
}

function QueueCard({ lead, onSelect, isFollowUp }) {
  const p = getPriorityStyle(lead.priority);
  return (
    <button
      onClick={() => onSelect(lead)}
      className="w-full text-left bg-white border border-slate-200 rounded-xl px-4 py-3.5 hover:border-blue-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <PriorityPip priority={lead.priority} />
            <p className="text-sm font-semibold text-slate-800 truncate">{lead.businessName}</p>
            {isFollowUp && (
              <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full font-medium shrink-0">
                Follow-up
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">{lead.industry}{lead.city ? ` · ${lead.city}` : ''}</p>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            {lead.email && (
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Mail size={11} />{lead.email}
              </span>
            )}
            {lead.phone && (
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Phone size={11} />{lead.phone}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <StatusBadge status={lead.status} />
          {p && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.bg} ${p.text}`}>
              {p.label}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function BulkLeadCard({ lead, isFollowUp, state, onUpdate, onApprove, onSkip, onRetry }) {
  const { status, subject, body, error } = state;
  const p = getPriorityStyle(lead.priority);

  const borderCls =
    status === 'approved' ? 'border-green-300 bg-green-50/40' :
    status === 'sent'     ? 'border-green-400 bg-green-50' :
    status === 'error'    ? 'border-red-200' :
    status === 'skipped'  ? 'border-slate-100 opacity-50' :
                            'border-slate-200';

  return (
    <div className={`bg-white border rounded-xl p-4 transition-all ${borderCls}`}>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <PriorityPip priority={lead.priority} />
        <span className="text-sm font-semibold text-slate-800">{lead.businessName}</span>
        <span className="text-xs text-slate-400">{lead.industry}{lead.city ? ` · ${lead.city}` : ''}</span>
        {isFollowUp && (
          <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full font-medium">
            Follow-up
          </span>
        )}
        {p && (
          <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${p.bg} ${p.text}`}>
            {p.label}
          </span>
        )}
      </div>

      {status === 'generating' && (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-3">
          <Loader2 size={14} className="animate-spin shrink-0" />
          Generating pitch...
        </div>
      )}

      {(status === 'ready' || status === 'approved' || status === 'skipped') && (
        <>
          <div className="space-y-2 mb-3">
            <div>
              <p className="text-xs text-slate-400 mb-1">Subject</p>
              <input
                value={subject}
                onChange={e => onUpdate('subject', e.target.value)}
                className="w-full text-sm text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Body</p>
              <textarea
                value={body}
                onChange={e => onUpdate('body', e.target.value)}
                rows={4}
                className="w-full text-sm text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {status === 'approved' ? (
              <>
                <span className="flex items-center gap-1.5 text-xs text-green-700 font-semibold">
                  <Check size={13} />
                  Approved
                </span>
                <button onClick={onSkip} className="text-xs text-slate-400 hover:text-slate-600 transition-colors ml-1">
                  Undo
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={onApprove}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Check size={11} />
                  Approve
                </button>
                <button
                  onClick={onSkip}
                  className="px-3 py-1.5 text-slate-500 text-xs font-medium rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  {status === 'skipped' ? 'Skipped — approve?' : 'Skip'}
                </button>
              </>
            )}
          </div>
        </>
      )}

      {status === 'sending' && (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
          <Loader2 size={14} className="animate-spin shrink-0" />
          Sending...
        </div>
      )}

      {status === 'sent' && (
        <div className="flex items-center gap-2 text-sm text-green-700 font-semibold py-2">
          <CheckCircle size={14} />
          Sent
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-2 pt-1">
          <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error || 'Something went wrong'}</p>
          <button onClick={onRetry} className="text-xs text-blue-600 hover:text-blue-700 transition-colors">
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

export default function OutreachView({ leads, onSelectLead, onRefresh }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const filterLeadId = searchParams.get('lead');

  const [tab, setTab] = useState(filterLeadId ? 'sent' : 'queue');
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [openedFilter, setOpenedFilter] = useState('all');

  const [bulkMode, setBulkMode] = useState(false);
  const [pitchState, setPitchState] = useState({});
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (filterLeadId) setTab('sent');
  }, [filterLeadId]);

  useEffect(() => {
    if (tab !== 'queue') {
      setBulkMode(false);
      setPitchState({});
    }
  }, [tab]);

  const q = search.toLowerCase();
  const matchSearch = (lead) =>
    !q ||
    lead.businessName.toLowerCase().includes(q) ||
    (lead.industry || '').toLowerCase().includes(q) ||
    (lead.city || '').toLowerCase().includes(q) ||
    (lead.email || '').toLowerCase().includes(q);

  const matchPriority = (lead) =>
    priorityFilter === 'all' || lead.priority === priorityFilter;

  const queue = leads
    .filter(l => l.email && l.outreachOptedOut !== 'Yes' && !l.outreachCount && !DEAD_STATUSES.has(l.status))
    .filter(matchSearch)
    .filter(matchPriority)
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9));

  const followups = leads
    .filter(l =>
      l.outreachCount === 1 &&
      !l.emailOpenedAt &&
      l.outreachOptedOut !== 'Yes' &&
      !DEAD_STATUSES.has(l.status) &&
      daysSince(l.lastOutreachAt) >= FOLLOWUP_DAYS
    )
    .filter(matchSearch)
    .filter(matchPriority)
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9));

  const allQueue = [...queue, ...followups];

  const sent = leads
    .filter(l => l.outreachCount > 0)
    .filter(l => filterLeadId ? l.id === filterLeadId : true)
    .filter(matchSearch)
    .filter(matchPriority)
    .filter(l => {
      if (openedFilter === 'opened')   return !!l.emailOpenedAt;
      if (openedFilter === 'unopened') return !l.emailOpenedAt;
      return true;
    })
    .sort((a, b) => new Date(b.lastOutreachAt || 0) - new Date(a.lastOutreachAt || 0));

  const filteredLead = filterLeadId ? leads.find(l => l.id === filterLeadId) : null;
  const hotLeads = sent.filter(l => l.emailOpenedAt && daysSince(l.emailOpenedAt) <= 2);

  const generatedCount = Object.values(pitchState).filter(s => s.status !== 'generating').length;
  const totalCount = Object.keys(pitchState).length;
  const approvedCount = Object.values(pitchState).filter(s => s.status === 'approved').length;
  const allGenerated = totalCount > 0 && generatedCount === totalCount;

  const isFollowUpLead = (lead) => lead.outreachCount > 0;

  const handleGenerateAll = async () => {
    setBulkMode(true);
    const initial = {};
    for (const lead of allQueue) {
      if (lead.subject && lead.emailBody) {
        initial[lead.id] = { status: 'ready', subject: lead.subject, body: lead.emailBody };
      } else {
        initial[lead.id] = { status: 'generating', subject: '', body: '' };
      }
    }
    setPitchState(initial);

    const toGenerate = allQueue.filter(l => !l.subject || !l.emailBody);
    await Promise.all(toGenerate.map(async (lead) => {
      try {
        const pitch = await api.generateOutreach(lead.id);
        setPitchState(prev => ({
          ...prev,
          [lead.id]: { status: 'ready', subject: pitch.subject, body: pitch.body },
        }));
      } catch (err) {
        setPitchState(prev => ({
          ...prev,
          [lead.id]: { status: 'error', subject: '', body: '', error: err.message },
        }));
      }
    }));
  };

  const handleSendApproved = async () => {
    setIsSending(true);
    const toSend = allQueue.filter(l => pitchState[l.id]?.status === 'approved');
    for (const lead of toSend) {
      const { subject, body } = pitchState[lead.id];
      setPitchState(prev => ({ ...prev, [lead.id]: { ...prev[lead.id], status: 'sending' } }));
      try {
        await api.updateLead(lead.id, { subject, emailBody: body });
        await api.sendOutreach(lead.id);
        setPitchState(prev => ({ ...prev, [lead.id]: { ...prev[lead.id], status: 'sent' } }));
      } catch (err) {
        setPitchState(prev => ({ ...prev, [lead.id]: { ...prev[lead.id], status: 'error', error: err.message } }));
      }
    }
    setIsSending(false);
    onRefresh?.();
  };

  const handleRetry = async (lead) => {
    setPitchState(prev => ({ ...prev, [lead.id]: { status: 'generating', subject: '', body: '' } }));
    try {
      const pitch = await api.generateOutreach(lead.id);
      setPitchState(prev => ({ ...prev, [lead.id]: { status: 'ready', subject: pitch.subject, body: pitch.body } }));
    } catch (err) {
      setPitchState(prev => ({ ...prev, [lead.id]: { status: 'error', subject: '', body: '', error: err.message } }));
    }
  };

  const updatePitch = (leadId, field, value) => {
    setPitchState(prev => ({ ...prev, [leadId]: { ...prev[leadId], [field]: value } }));
  };

  const setStatus = (leadId, status) => {
    setPitchState(prev => ({ ...prev, [leadId]: { ...prev[leadId], status } }));
  };

  const totalQueueCount = leads.filter(l => l.email && l.outreachOptedOut !== 'Yes' && !l.outreachCount && !DEAD_STATUSES.has(l.status)).length;
  const totalFollowupCount = leads.filter(l => l.outreachCount === 1 && !l.emailOpenedAt && l.outreachOptedOut !== 'Yes' && !DEAD_STATUSES.has(l.status) && daysSince(l.lastOutreachAt) >= FOLLOWUP_DAYS).length;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">Outreach</h1>
        <p className="text-sm text-slate-500 mt-0.5">AI-powered cold email outreach</p>

        {filteredLead && (
          <div className="mt-3 flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
            <Filter size={13} className="text-blue-500 shrink-0" />
            <span className="text-sm text-blue-700 font-medium">{filteredLead.businessName}</span>
            <button onClick={() => navigate('/outreach')} className="ml-auto text-xs text-blue-500 hover:text-blue-700 transition-colors">
              Clear filter
            </button>
          </div>
        )}

        {hotLeads.length > 0 && tab === 'sent' && !filterLeadId && (
          <div className="mt-3 flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2.5">
            <PhoneCall size={14} className="text-orange-600 shrink-0" />
            <span className="text-sm text-orange-800 font-medium">
              {hotLeads.length} lead{hotLeads.length > 1 ? 's' : ''} opened your email recently — call {hotLeads.length > 1 ? 'them' : hotLeads[0].businessName} today
            </span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-4">
        {[
          { id: 'queue', label: `Queue (${totalQueueCount + totalFollowupCount})` },
          { id: 'sent',  label: `Sent (${leads.filter(l => l.outreachCount > 0).length})` },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search name, industry, city, email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1">
          {['all', '🔴 Priority 1', '🟠 Priority 2', '🟡 Priority 3'].map((p, i) => {
            const labels = ['All', 'P1', 'P2', 'P3'];
            const active = priorityFilter === p;
            const cfg = p !== 'all' ? getPriorityStyle(p) : null;
            return (
              <button
                key={p}
                onClick={() => setPriorityFilter(p)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  active
                    ? cfg ? `${cfg.bg} ${cfg.text}` : 'bg-slate-100 text-slate-700'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {labels[i]}
              </button>
            );
          })}
        </div>

        {tab === 'sent' && (
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1">
            {[
              { id: 'all',      label: 'All'        },
              { id: 'opened',   label: 'Opened'     },
              { id: 'unopened', label: 'Not opened' },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setOpenedFilter(f.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  openedFilter === f.id ? 'bg-slate-100 text-slate-700' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Queue tab — normal mode ── */}
      {tab === 'queue' && !bulkMode && (
        <div className="space-y-2">
          {allQueue.length > 0 && (
            <div className="flex justify-end mb-3">
              <button
                onClick={handleGenerateAll}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Sparkles size={12} />
                Generate All ({allQueue.length})
              </button>
            </div>
          )}

          {/* New leads section */}
          {queue.length > 0 && (
            <>
              {followups.length > 0 && (
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider pb-1">New leads</p>
              )}
              {queue.map(lead => (
                <QueueCard key={lead.id} lead={lead} onSelect={onSelectLead} isFollowUp={false} />
              ))}
            </>
          )}

          {/* Follow-ups section */}
          {followups.length > 0 && (
            <>
              <div className="flex items-center gap-2 pt-4 pb-1">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Follow-ups</p>
                <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                  {followups.length} ready
                </span>
              </div>
              {followups.map(lead => (
                <QueueCard key={lead.id} lead={lead} onSelect={onSelectLead} isFollowUp />
              ))}
            </>
          )}

          {allQueue.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-16">
              {search || priorityFilter !== 'all' ? 'No leads match your filters.' : 'No leads in queue — add email addresses to leads to populate this.'}
            </p>
          )}
        </div>
      )}

      {/* ── Queue tab — bulk review mode ── */}
      {tab === 'queue' && bulkMode && (
        <div className="space-y-3">
          {/* Bulk action bar */}
          <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 sticky top-4 z-10 shadow-sm">
            <button
              onClick={() => { setBulkMode(false); setPitchState({}); }}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
            >
              <ChevronLeft size={13} />
              Cancel
            </button>
            <div className="flex-1 text-xs text-slate-500">
              {allGenerated
                ? `All ${totalCount} pitches ready`
                : `Generating… ${generatedCount} / ${totalCount}`}
            </div>
            {approvedCount > 0 && (
              <button
                onClick={handleSendApproved}
                disabled={isSending || !allGenerated}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSending
                  ? <><Loader2 size={11} className="animate-spin" />Sending...</>
                  : <><SendHorizontal size={11} />Send Approved ({approvedCount})</>}
              </button>
            )}
          </div>

          {allQueue.map(lead => {
            const state = pitchState[lead.id];
            if (!state) return null;
            return (
              <BulkLeadCard
                key={lead.id}
                lead={lead}
                isFollowUp={isFollowUpLead(lead)}
                state={state}
                onUpdate={(field, value) => updatePitch(lead.id, field, value)}
                onApprove={() => setStatus(lead.id, 'approved')}
                onSkip={() => setStatus(lead.id, state.status === 'approved' ? 'ready' : 'skipped')}
                onRetry={() => handleRetry(lead)}
              />
            );
          })}
        </div>
      )}

      {/* ── Sent tab ── */}
      {tab === 'sent' && (
        <div className="space-y-2">
          {sent.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-16">
              {search || priorityFilter !== 'all' || openedFilter !== 'all' ? 'No leads match your filters.' : 'No outreach emails sent yet.'}
            </p>
          ) : (
            sent.map(lead => {
              const state = outreachState(lead);
              const p = getPriorityStyle(lead.priority);
              return (
                <button
                  key={lead.id}
                  onClick={() => onSelectLead(lead)}
                  className={`w-full text-left bg-white border rounded-xl px-4 py-4 hover:shadow-sm transition-all ${
                    state.type === 'hot' ? 'border-orange-200 hover:border-orange-300' : 'border-slate-200 hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <PriorityPip priority={lead.priority} />
                        <p className="text-sm font-semibold text-slate-800 truncate">{lead.businessName}</p>
                      </div>
                      <p className="text-xs text-slate-500">{lead.industry}{lead.city ? ` · ${lead.city}` : ''}</p>

                      <div className={`inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-lg border text-xs font-medium ${state.cls}`}>
                        {state.type === 'hot'      && <PhoneCall size={11} />}
                        {state.type === 'opened'   && <CheckCircle size={11} />}
                        {state.type === 'followup' && <AlertCircle size={11} />}
                        {state.type === 'waiting'  && <Clock size={11} />}
                        {state.type === 'silent'   && <XCircle size={11} />}
                        {state.label}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 mt-2">
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Mail size={11} />
                          Sent {lead.outreachCount}×
                        </span>
                        {lead.outreachSentAt && (
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Clock size={11} />
                            First contact {timeAgo(lead.outreachSentAt)}
                          </span>
                        )}
                        {lead.email && (
                          <span className="text-xs text-slate-400">{lead.email}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <StatusBadge status={lead.status} />
                      {p && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.bg} ${p.text}`}>
                          {p.label}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
