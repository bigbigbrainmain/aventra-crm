import { useState } from 'react';
import { Search, Mail, Phone, ExternalLink } from 'lucide-react';
import { getStatusStyle, getPriorityStyle, STATUSES } from '../utils/constants';

function StatusBadge({ status }) {
  const s = getStatusStyle(status);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}

function PriorityDot({ priority }) {
  const p = getPriorityStyle(priority);
  if (!p) return null;
  return <span className={`inline-block w-2 h-2 rounded-full ${p.dot}`} title={priority} />;
}

function LeadCard({ lead, onClick }) {
  return (
    <button
      onClick={onClick}
      className="bg-white border border-slate-100 rounded-xl p-4 text-left hover:shadow-md hover:border-blue-200 transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <PriorityDot priority={lead.priority} />
          <p className="font-semibold text-slate-900 text-sm truncate">{lead.businessName}</p>
        </div>
        <StatusBadge status={lead.status} />
      </div>

      <p className="text-xs text-slate-400 mb-3 truncate">{lead.industry}{lead.city ? ` · ${lead.city}` : ''}</p>

      <div className="space-y-1">
        {lead.email && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Mail size={11} className="shrink-0" />
            <span className="truncate">{lead.email}</span>
          </div>
        )}
        {lead.phone && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Phone size={11} className="shrink-0" />
            <span>{lead.phone}</span>
          </div>
        )}
        {lead.website && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <ExternalLink size={11} className="shrink-0" />
            <span className="truncate">{lead.website.replace(/^https?:\/\//, '')}</span>
          </div>
        )}
      </div>

      {lead.priority && (
        <div className="mt-3 pt-3 border-t border-slate-50">
          {(() => {
            const p = getPriorityStyle(lead.priority);
            return p ? (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.bg} ${p.text}`}>
                {lead.priority}
              </span>
            ) : null;
          })()}
        </div>
      )}
    </button>
  );
}

export default function LeadsView({ leads, onSelectLead, onRefresh }) {
  const [activeStatus, setActiveStatus] = useState('All');
  const [search, setSearch] = useState('');

  const filtered = leads.filter(l => {
    const matchStatus = activeStatus === 'All' || l.status === activeStatus;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      l.businessName.toLowerCase().includes(q) ||
      l.industry.toLowerCase().includes(q) ||
      l.city.toLowerCase().includes(q) ||
      l.email.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const tabs = ['All', ...STATUSES];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">All Leads</h2>
          <p className="text-slate-500 text-sm mt-0.5">{leads.length} total leads</p>
        </div>
        <button
          onClick={onRefresh}
          className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search by name, industry, city, email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 mb-6 scrollbar-thin">
        {tabs.map(status => {
          const count = status === 'All' ? leads.length : leads.filter(l => l.status === status).length;
          const active = activeStatus === status;
          return (
            <button
              key={status}
              onClick={() => setActiveStatus(status)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors
                ${active
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
            >
              {status}
              <span className={`px-1.5 py-0.5 rounded-full text-xs font-semibold
                ${active ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-400 text-sm">
            {search ? `No leads matching "${search}"` : `No leads with status "${activeStatus}"`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(lead => (
            <LeadCard key={lead.id} lead={lead} onClick={() => onSelectLead(lead)} />
          ))}
        </div>
      )}
    </div>
  );
}
