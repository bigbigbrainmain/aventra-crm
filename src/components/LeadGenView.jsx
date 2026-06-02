import { useState } from 'react';
import { Search, Shuffle, AlertTriangle } from 'lucide-react';
import { api } from '../utils/api';
import LeadReviewModal from './LeadReviewModal';

const INDUSTRIES = [
  'plumber', 'electrician', 'builder', 'roofer', 'painter decorator',
  'flooring installer', 'kitchen fitter', 'bathroom fitter', 'plasterer',
  'landscaper', 'carpenter', 'glazier', 'locksmith', 'window cleaner',
  'carpet cleaner', 'pest control', 'dog groomer', 'personal trainer',
  'chiropractor', 'dentist', 'optician', 'solicitor', 'accountant',
  'mortgage broker', 'estate agent', 'restaurant', 'cafe', 'bakery',
  'hair salon', 'barber', 'nail salon', 'beauty salon', 'gym',
  'driving instructor', 'photographer', 'event planner', 'catering',
  'cleaning company', 'removal company', 'skip hire',
];

const CITIES = [
  'Leeds', 'Sheffield', 'Manchester', 'Birmingham', 'Bristol',
  'Nottingham', 'Leicester', 'Liverpool', 'Newcastle', 'Hull',
  'Bradford', 'Coventry', 'Southampton', 'Brighton', 'Plymouth',
  'Derby', 'Wolverhampton', 'Exeter', 'Chester', 'Preston',
  'Bolton', 'Warrington', 'Middlesbrough', 'York', 'Harrogate',
  'Halifax', 'Huddersfield', 'Wakefield', 'Doncaster', 'Lincoln',
  'Peterborough', 'Luton', 'Reading', 'Swindon', 'Bath',
  'Cheltenham', 'Northampton', 'Ipswich', 'Norwich', 'Cambridge',
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

export default function LeadGenView({ onRefresh }) {
  const [industry, setIndustry] = useState('');
  const [city, setCity] = useState('');
  const [finding, setFinding] = useState(false);
  const [findResult, setFindResult] = useState(null);
  const [reviewLeads, setReviewLeads] = useState(null);

  function fillRandom() {
    setIndustry(pick(INDUSTRIES));
    setCity(pick(CITIES));
  }

  async function handleFind() {
    const q = industry.trim() || pick(INDUSTRIES);
    const c = city.trim() || pick(CITIES);
    if (!industry.trim()) setIndustry(q);
    if (!city.trim()) setCity(c);

    setFinding(true);
    setFindResult(null);
    try {
      const result = await api.leadGenFind({ industry: q, city: c });
      setFindResult(result);
      if (result.leads?.length > 0) setReviewLeads(result.leads);
    } catch (err) {
      setFindResult({ error: err.message });
    } finally {
      setFinding(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-4">
        <h1 className="text-lg font-bold text-slate-900">Lead Generation</h1>
        <p className="text-slate-500 text-sm">Find new leads via Google Places</p>
      </div>

      <div className="p-6 space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-2">
          <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
          <p className="text-amber-800 text-sm">
            <strong>Under construction.</strong> Requires <code className="text-xs bg-amber-100 px-1 rounded">GOOGLE_API_KEY</code> in Netlify environment variables with Places API enabled.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Search size={15} className="text-slate-500" />
            <h3 className="font-semibold text-slate-800">Find Leads</h3>
          </div>

          <div className="flex gap-2 mb-3">
            <input
              type="text"
              placeholder="Industry (e.g. plumber)"
              value={industry}
              onChange={e => setIndustry(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleFind()}
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="City (e.g. Leeds)"
              value={city}
              onChange={e => setCity(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleFind()}
              className="w-36 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={fillRandom}
              title="Fill with random industry + city"
              className="p-2 border border-slate-200 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Shuffle size={15} />
            </button>
            <button
              onClick={handleFind}
              disabled={finding}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {finding ? 'Searching…' : 'Find Leads'}
            </button>
          </div>

          <p className="text-xs text-slate-400 mb-3">Leave fields blank to pick a random combo automatically.</p>

          {findResult && (
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              {findResult.error ? (
                <p className="text-red-600 text-sm">{findResult.error}</p>
              ) : (
                <>
                  <p className="text-slate-700 text-sm">
                    Found <strong>{findResult.count}</strong> new lead{findResult.count !== 1 ? 's' : ''} added to sheet
                    {findResult.count === 0 && ' — all already in CRM'}
                  </p>
                  {findResult.count > 0 && (
                    <button
                      onClick={() => setReviewLeads(findResult.leads)}
                      className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Review {findResult.count} lead{findResult.count !== 1 ? 's' : ''}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {reviewLeads && (
        <LeadReviewModal
          leads={reviewLeads}
          onDiscard={(id) => api.deleteLead(id)}
          onClose={() => { setReviewLeads(null); onRefresh(); }}
        />
      )}
    </div>
  );
}
