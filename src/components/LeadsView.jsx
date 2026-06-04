import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Mail, Phone, ExternalLink, ChevronDown, X, Star, Clock, Eye, ArrowUpDown } from 'lucide-react';
import { getStatusStyle, STATUSES, EMAIL_STAGE_CONFIG, EMAIL_STAGES, getEmailStage } from '../utils/constants';

// Multi-select dropdown component
function MultiSelect({ label, options, selected, onChange, renderOption, activeClassName }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (val) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };

  const isActive = selected.length > 0;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors whitespace-nowrap
          ${isActive
            ? (activeClassName || 'bg-blue-600 text-white border-blue-600')
            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
      >
        {label}
        {isActive && (
          <span className="bg-white/20 text-white text-xs px-1.5 py-0.5 rounded-full font-semibold">
            {selected.length}
          </span>
        )}
        <ChevronDown size={13} className={isActive ? 'text-white/80' : 'text-slate-400'} />
      </button>

      {isActive && (
        <button
          onClick={() => onChange([])}
          className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-slate-500 hover:bg-slate-700 text-white rounded-full flex items-center justify-center transition-colors z-10"
        >
          <X size={9} />
        </button>
      )}

      {open && (
        <div className="absolute top-full left-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg z-20 min-w-[180px] py-1 overflow-hidden">
          {options.map(opt => {
            const checked = selected.includes(opt);
            return (
              <button
                key={opt}
                onClick={() => toggle(opt)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors
                  ${checked ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`}
              >
                <span className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 transition-colors
                  ${checked ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                  {checked && <span className="text-white text-xs leading-none">✓</span>}
                </span>
                {renderOption ? renderOption(opt) : opt}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const s = getStatusStyle(status);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}

function EmailStageBadge({ stage, count }) {
  const cfg = EMAIL_STAGE_CONFIG[stage] || EMAIL_STAGE_CONFIG.none;
  const icon =
    stage === 'scheduled' ? <Clock size={10} className="shrink-0" /> :
    stage === 'opened'    ? <Eye size={10} className="shrink-0" /> :
    stage === 'sent'      ? <Mail size={10} className="shrink-0" /> :
    null;
  const label =
    stage === 'sent'   ? `${count}x sent` :
    stage === 'opened' ? `${count}x · opened` :
    cfg.label;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      {icon}
      {label}
    </span>
  );
}

function LeadCard({ lead, emailStage, onClick, onToggleFavourite }) {
  return (
    <div
      onClick={onClick}
      className="bg-white border border-slate-100 rounded-xl p-4 text-left hover:shadow-md hover:border-blue-200 transition-all cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <p className="font-semibold text-slate-900 text-sm truncate">{lead.businessName}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={e => { e.stopPropagation(); onToggleFavourite(lead.id); }}
            title={lead.isFavourite ? 'Remove from favourites' : 'Add to favourites'}
            className={`p-0.5 rounded transition-colors ${lead.isFavourite ? 'text-amber-400 hover:text-amber-500' : 'text-slate-200 hover:text-amber-300'}`}
          >
            <Star size={13} fill={lead.isFavourite ? 'currentColor' : 'none'} />
          </button>
          <StatusBadge status={lead.status} />
        </div>
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

      <div className="mt-3 pt-3 border-t border-slate-50 flex items-center justify-between gap-2">
        {lead.reviewCount > 0 ? (
          <span className="text-xs text-slate-400">
            ★ {lead.avgRating} <span className="text-slate-300">·</span> {lead.reviewCount} reviews
          </span>
        ) : <span />}
        <EmailStageBadge stage={emailStage} count={lead.outreachCount || 0} />
      </div>
    </div>
  );
}

export default function LeadsView({ leads, scheduledEmails = [], onSelectLead, onRefresh, onToggleFavourite }) {
  const [tab, setTab] = useState('all');
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [selectedEmailStages, setSelectedEmailStages] = useState([]);
  const [websiteFilter, setWebsiteFilter] = useState(null); // null | 'has' | 'none'
  const [sortBy, setSortBy] = useState('default');
  const [search, setSearch] = useState('');
  const [hiddenStatuses, setHiddenStatuses] = useState(() => {
    try { return JSON.parse(localStorage.getItem('crm_hiddenStatuses') || '["Lost"]'); }
    catch { return []; }
  });

  const updateHiddenStatuses = (val) => {
    setHiddenStatuses(val);
    localStorage.setItem('crm_hiddenStatuses', JSON.stringify(val));
  };

  const scheduledLeadIds = useMemo(() => {
    const ids = new Set();
    scheduledEmails.filter(s => s.status === 'pending').forEach(s => ids.add(s.leadId));
    return ids;
  }, [scheduledEmails]);

  const favouriteCount = leads.filter(l => l.isFavourite).length;

  const baseList = tab === 'favourites' ? leads.filter(l => l.isFavourite) : leads;

  const filtered = baseList.filter(l => {
    const matchStatus     = selectedStatuses.length === 0      || selectedStatuses.includes(l.status);
    const matchNotHidden  = !hiddenStatuses.includes(l.status);
    const matchEmailStage = selectedEmailStages.length === 0   || selectedEmailStages.includes(getEmailStage(l, scheduledLeadIds));
    const matchWebsite    = websiteFilter === null || (websiteFilter === 'has' ? !!l.website : !l.website);
    const q = search.toLowerCase();
    const matchSearch     = !q ||
      l.businessName.toLowerCase().includes(q) ||
      l.industry.toLowerCase().includes(q) ||
      l.city.toLowerCase().includes(q) ||
      l.email.toLowerCase().includes(q);
    return matchStatus && matchNotHidden && matchEmailStage && matchWebsite && matchSearch;
  });

  function idToTimestamp(id) {
    const part = (id || '').split('_')[1] || '';
    return parseInt(part.slice(0, -3) || '0', 36);
  }

  const sorted = useMemo(() => {
    const copy = [...filtered];
    switch (sortBy) {
      case 'name':
        return copy.sort((a, b) => a.businessName.localeCompare(b.businessName));
      case 'outreach':
        return copy.sort((a, b) => (b.lastOutreachAt || '').localeCompare(a.lastOutreachAt || ''));
      case 'status':
        return copy.sort((a, b) => a.status.localeCompare(b.status));
      case 'favourites':
        return copy.sort((a, b) => (b.isFavourite ? 1 : 0) - (a.isFavourite ? 1 : 0));
      default: // recently added
        return copy.sort((a, b) => idToTimestamp(b.id) - idToTimestamp(a.id));
    }
  }, [filtered, sortBy, tab]);

  const anyFilter = selectedStatuses.length > 0 || selectedEmailStages.length > 0 || websiteFilter !== null || hiddenStatuses.length > 0 || search;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Leads</h2>
          <p className="text-slate-500 text-sm mt-0.5">
            {anyFilter ? `${sorted.length} of ${baseList.length} leads` : `${baseList.length} ${tab === 'favourites' ? 'favourited' : 'total'} leads`}
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit mb-6">
        <button
          onClick={() => setTab('all')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          All
        </button>
        <button
          onClick={() => setTab('favourites')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'favourites' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Star size={13} fill={tab === 'favourites' ? 'currentColor' : 'none'} className={tab === 'favourites' ? 'text-amber-400' : 'text-slate-400'} />
          Favourites
          {favouriteCount > 0 && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${tab === 'favourites' ? 'bg-amber-100 text-amber-600' : 'bg-slate-200 text-slate-500'}`}>
              {favouriteCount}
            </span>
          )}
        </button>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, industry, city, email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Status filter */}
        <MultiSelect
          label="Status"
          options={STATUSES}
          selected={selectedStatuses}
          onChange={setSelectedStatuses}
          renderOption={(opt) => {
            const s = getStatusStyle(opt);
            return (
              <span className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                {opt}
              </span>
            );
          }}
        />

        {/* Hide statuses */}
        <MultiSelect
          label="Hide"
          options={STATUSES}
          selected={hiddenStatuses}
          onChange={updateHiddenStatuses}
          activeClassName="bg-slate-700 text-white border-slate-700"
          renderOption={(opt) => {
            const s = getStatusStyle(opt);
            return (
              <span className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                {opt}
              </span>
            );
          }}
        />

        {/* Website filter */}
        <button
          onClick={() => setWebsiteFilter(v => v === null ? 'none' : v === 'none' ? 'has' : null)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-colors whitespace-nowrap
            ${websiteFilter !== null
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
        >
          Website
          {websiteFilter === 'has' && <span className="text-emerald-300 font-bold">✓</span>}
          {websiteFilter === 'none' && <span className="text-red-300 font-bold">✗</span>}
        </button>

        {/* Email stage filter */}
        <MultiSelect
          label="Email"
          options={EMAIL_STAGES}
          selected={selectedEmailStages}
          onChange={setSelectedEmailStages}
          activeClassName="bg-blue-600 text-white border-blue-600"
          renderOption={(opt) => {
            const cfg = EMAIL_STAGE_CONFIG[opt];
            return (
              <span className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                {cfg.label}
              </span>
            );
          }}
        />

        {/* Sort */}
        <div className="relative flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-600">
          <ArrowUpDown size={13} className="text-slate-400 shrink-0" />
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="appearance-none bg-transparent text-sm text-slate-600 font-medium focus:outline-none cursor-pointer pr-1"
          >
            <option value="default">Recently added</option>
            <option value="favourites">Favourites first</option>
            <option value="name">Name A–Z</option>
            <option value="status">Status</option>
            <option value="outreach">Last outreach</option>
          </select>
        </div>

        {/* Clear all */}
        {anyFilter && (
          <button
            onClick={() => { setSelectedStatuses([]); setSelectedEmailStages([]); setWebsiteFilter(null); updateHiddenStatuses(['Lost']); setSearch(''); }}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Grid */}
      {sorted.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-400 text-sm">
            {tab === 'favourites' && !anyFilter ? 'No favourites yet — star a lead to pin it here' : 'No leads match the current filters'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map(lead => (
            <LeadCard
              key={lead.id}
              lead={lead}
              emailStage={getEmailStage(lead, scheduledLeadIds)}
              onClick={() => onSelectLead(lead)}
              onToggleFavourite={onToggleFavourite}
            />
          ))}
        </div>
      )}
    </div>
  );
}
