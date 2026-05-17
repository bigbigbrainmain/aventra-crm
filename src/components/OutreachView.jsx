import { useState } from 'react';
import { Mail, Clock, CheckCircle, XCircle, Filter } from 'lucide-react';
import { timeAgo } from '../utils/constants';

export default function OutreachView({ leads, onSelectLead, filterLeadId, onClearFilter }) {
  const [tab, setTab] = useState(filterLeadId ? 'sent' : 'queue');

  const queue = leads.filter(l =>
    l.email && l.outreachOptedOut !== 'Yes' && !l.outreachCount
  );

  const sent = leads
    .filter(l => l.outreachCount > 0)
    .filter(l => filterLeadId ? l.id === filterLeadId : true)
    .sort((a, b) => new Date(b.lastOutreachAt || 0) - new Date(a.lastOutreachAt || 0));

  const filteredLead = filterLeadId ? leads.find(l => l.id === filterLeadId) : null;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Outreach</h1>
        <p className="text-sm text-slate-500 mt-0.5">AI-powered cold email outreach</p>
        {filteredLead && (
          <div className="mt-3 flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
            <Filter size={13} className="text-blue-500 shrink-0" />
            <span className="text-sm text-blue-700 font-medium">{filteredLead.businessName}</span>
            <button
              onClick={onClearFilter}
              className="ml-auto text-xs text-blue-500 hover:text-blue-700 transition-colors"
            >
              Clear filter
            </button>
          </div>
        )}
      </div>

      <div className="flex border-b border-slate-200 mb-5">
        {[
          { id: 'queue', label: `Queue (${queue.length})` },
          { id: 'sent',  label: `Sent (${sent.length})` },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'queue' && (
        <div className="space-y-2">
          {queue.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-16">
              No leads in queue — leads with email addresses that haven't been contacted will appear here.
            </p>
          ) : (
            queue.map(lead => (
              <button
                key={lead.id}
                onClick={() => onSelectLead(lead)}
                className="w-full text-left bg-white border border-slate-200 rounded-xl px-4 py-3 hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{lead.businessName}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{lead.industry}{lead.city ? ` · ${lead.city}` : ''}</p>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">{lead.email}</span>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {tab === 'sent' && (
        <div className="space-y-2">
          {sent.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-16">No outreach emails sent yet.</p>
          ) : (
            sent.map(lead => (
              <button
                key={lead.id}
                onClick={() => onSelectLead(lead)}
                className="w-full text-left bg-white border border-slate-200 rounded-xl px-4 py-4 hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{lead.businessName}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{lead.industry}{lead.city ? ` · ${lead.city}` : ''}</p>
                    <div className="flex items-center gap-4 mt-2 flex-wrap">
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Mail size={11} />
                        Sent {lead.outreachCount}× · {timeAgo(lead.lastOutreachAt)}
                      </span>
                      {lead.outreachSentAt && (
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Clock size={11} />
                          First contact {timeAgo(lead.outreachSentAt)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 mt-0.5">
                    {lead.emailOpenedAt ? (
                      <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-100 px-2.5 py-1 rounded-full font-medium whitespace-nowrap">
                        <CheckCircle size={11} />
                        Opened {timeAgo(lead.emailOpenedAt)}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full whitespace-nowrap">
                        <XCircle size={11} />
                        Not opened
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
