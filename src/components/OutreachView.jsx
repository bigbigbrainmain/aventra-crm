import { useState } from 'react';
import { Search, Mail, Phone, CheckCircle, XCircle, Clock, Filter, PhoneCall, AlertCircle } from 'lucide-react';
import { timeAgo, getStatusStyle, getPriorityStyle } from '../utils/constants';

const PRIORITY_ORDER = { '🔴 Priority 1': 0, '🟠 Priority 2': 1, '🟡 Priority 3': 2, '🟢 Skip': 3 };
const DEAD_STATUSES = new Set(['Lost', 'Qualified Out', 'Closed Won', 'NRTB', 'Incorrect Product Fit']);

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

export default function OutreachView({ leads, onSelectLead, filterLeadId, onClearFilter }) {
  const [tab, setTab] = useState(filterLeadId ? 'sent' : 'queue');
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [openedFilter, setOpenedFilter] = useState('all');

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

  const sent = leads
    .filter(l => l.outreachCount > 0)
    .filter(l => filterLeadId ? l.id === filterLeadId : true)
    .filter(matchSearch)
    .filter(matchPriority)
    .filter(l => {
      if (openedFilter === 'opened')    return !!l.emailOpenedAt;
      if (openedFilter === 'unopened')  return !l.emailOpenedAt;
      return true;
    })
    .sort((a, b) => new Date(b.lastOutreachAt || 0) - new Date(a.lastOutreachAt || 0));

  const filteredLead = filterLeadId ? leads.find(l => l.id === filterLeadId) : null;
  const hotLeads = sent.filter(l => l.emailOpenedAt && daysSince(l.emailOpenedAt) <= 2);

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
            <button onClick={onClearFilter} className="ml-auto text-xs text-blue-500 hover:text-blue-700 transition-colors">
              Clear filter
            </button>
          </div>
        )}

        {/* Hot leads callout */}
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
          { id: 'queue', label: `Queue (${leads.filter(l => l.email && l.outreachOptedOut !== 'Yes' && !l.outreachCount).length})` },
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

        {/* Priority filter */}
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

        {/* Opened filter — sent tab only */}
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

      {/* Queue tab */}
      {tab === 'queue' && (
        <div className="space-y-2">
          {queue.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-16">
              {search || priorityFilter !== 'all' ? 'No leads match your filters.' : 'No leads in queue — add email addresses to leads to populate this.'}
            </p>
          ) : (
            queue.map(lead => {
              const p = getPriorityStyle(lead.priority);
              const s = getStatusStyle(lead.status);
              return (
                <button
                  key={lead.id}
                  onClick={() => onSelectLead(lead)}
                  className="w-full text-left bg-white border border-slate-200 rounded-xl px-4 py-3.5 hover:border-blue-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <PriorityPip priority={lead.priority} />
                        <p className="text-sm font-semibold text-slate-800 truncate">{lead.businessName}</p>
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
            })
          )}
        </div>
      )}

      {/* Sent tab */}
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

                      {/* Actionable state badge */}
                      <div className={`inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-lg border text-xs font-medium ${state.cls}`}>
                        {state.type === 'hot'      && <PhoneCall size={11} />}
                        {state.type === 'opened'   && <CheckCircle size={11} />}
                        {state.type === 'followup' && <AlertCircle size={11} />}
                        {state.type === 'waiting'  && <Clock size={11} />}
                        {state.type === 'silent'   && <XCircle size={11} />}
                        {state.label}
                      </div>

                      {/* Meta row */}
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
