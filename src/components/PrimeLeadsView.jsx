import { Phone, Mail, ExternalLink, MessageSquare, Eye } from 'lucide-react';
import { timeAgo } from '../utils/constants';

function PrimeCard({ lead, onSelect }) {
  const replied = lead.status === 'Replied';
  return (
    <div
      onClick={() => onSelect(lead)}
      className={`bg-white rounded-xl border p-4 cursor-pointer hover:shadow-md transition-all ${
        replied ? 'border-emerald-200 hover:border-emerald-400' : 'border-amber-200 hover:border-amber-400'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="font-semibold text-slate-900 text-sm">{lead.businessName}</p>
          <p className="text-xs text-slate-400 mt-0.5">{lead.industry}{lead.city ? ` · ${lead.city}` : ''}</p>
        </div>
        <span className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-full flex items-center gap-1 ${
          replied
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-amber-100 text-amber-700'
        }`}>
          {replied ? <><MessageSquare size={11} /> Replied</> : <><Eye size={11} /> Opened</>}
        </span>
      </div>

      <div className="space-y-1 mt-3">
        {lead.phone && (
          <a
            href={`tel:${lead.phone}`}
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-2 text-xs text-slate-600 hover:text-blue-600 transition-colors"
          >
            <Phone size={11} className="shrink-0" />
            {lead.phone}
          </a>
        )}
        {lead.email && (
          <a
            href={`mailto:${lead.email}`}
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-2 text-xs text-slate-600 hover:text-blue-600 transition-colors truncate"
          >
            <Mail size={11} className="shrink-0" />
            {lead.email}
          </a>
        )}
        {lead.website && (
          <a
            href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-blue-600 transition-colors truncate"
          >
            <ExternalLink size={11} className="shrink-0" />
            {lead.website.replace(/^https?:\/\//, '')}
          </a>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-slate-50 flex items-center justify-between">
        <span className="text-xs text-slate-400">
          {lead.outreachCount || 0} email{lead.outreachCount !== 1 ? 's' : ''} sent
        </span>
        <span className="text-xs text-slate-400">
          {replied
            ? 'replied ' + timeAgo(lead.lastOutreachAt)
            : 'opened ' + timeAgo(lead.emailOpenedAt)
          }
        </span>
      </div>
    </div>
  );
}

export default function PrimeLeadsView({ leads = [], onSelectLead }) {
  const replied = leads.filter(l => l.status === 'Replied');
  const opened  = leads.filter(l => l.emailOpenedAt && l.status !== 'Replied');

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Prime Leads</h2>
        <p className="text-slate-500 text-sm mt-0.5">Leads that replied or opened — call these first</p>
      </div>

      {replied.length === 0 && opened.length === 0 && (
        <div className="text-center py-20">
          <p className="text-slate-400 text-sm">No prime leads yet — keep the outreach running and they'll appear here</p>
        </div>
      )}

      {replied.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="font-semibold text-slate-800">Replied</h3>
            <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-full">{replied.length}</span>
            <span className="text-xs text-slate-400 ml-1">— call these now</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {replied.map(lead => (
              <PrimeCard key={lead.id} lead={lead} onSelect={onSelectLead} />
            ))}
          </div>
        </section>
      )}

      {opened.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h3 className="font-semibold text-slate-800">Opened, no reply</h3>
            <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">{opened.length}</span>
            <span className="text-xs text-slate-400 ml-1">— follow-up auto-scheduled</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {opened.map(lead => (
              <PrimeCard key={lead.id} lead={lead} onSelect={onSelectLead} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
