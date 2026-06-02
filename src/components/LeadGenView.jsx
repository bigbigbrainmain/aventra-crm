import { useState, useMemo } from 'react';
import { Search, Zap, Mail, AlertTriangle } from 'lucide-react';
import { api } from '../utils/api';
import LeadReviewModal from './LeadReviewModal';

function StepCard({ number, title, Icon, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
          {number}
        </div>
        <Icon size={15} className="text-slate-500 shrink-0" />
        <h3 className="font-semibold text-slate-800">{title}</h3>
      </div>
      {children}
    </div>
  );
}

export default function LeadGenView({ leads = [], onRefresh }) {
  const [industry, setIndustry] = useState('');
  const [city, setCity] = useState('');
  const [finding, setFinding] = useState(false);
  const [findResult, setFindResult] = useState(null);
  const [reviewLeads, setReviewLeads] = useState(null);

  const [scoring, setScoring] = useState(false);
  const [scoreLog, setScoreLog] = useState([]);

  const [findingEmails, setFindingEmails] = useState(false);
  const [emailLog, setEmailLog] = useState([]);

  const unscoredLeads = useMemo(() => leads.filter(l => !l.priority), [leads]);
  const noEmailLeads = useMemo(() => leads.filter(l => !l.email), [leads]);

  async function handleFind() {
    if (!industry.trim() || !city.trim()) return;
    setFinding(true);
    setFindResult(null);
    try {
      const result = await api.leadGenFind({ industry: industry.trim(), city: city.trim() });
      setFindResult(result);
      if (result.leads?.length > 0) setReviewLeads(result.leads);
    } catch (err) {
      setFindResult({ error: err.message });
    } finally {
      setFinding(false);
    }
  }

  async function handleScore() {
    const batch = unscoredLeads.slice(0, 5);
    if (!batch.length) return;
    setScoring(true);
    setScoreLog(prev => [...prev, `Scoring ${batch.length} website${batch.length !== 1 ? 's' : ''}...`]);
    try {
      const result = await api.leadGenScore(batch.map(l => l.id));
      result.results.forEach(r => {
        const scoreStr = r.score !== null ? ` (${r.score}/100)` : '';
        setScoreLog(prev => [...prev, `${r.businessName}: ${r.priority}${scoreStr}`]);
      });
      await onRefresh();
    } catch (err) {
      setScoreLog(prev => [...prev, `Error: ${err.message}`]);
    } finally {
      setScoring(false);
    }
  }

  async function handleFindEmails() {
    const batch = noEmailLeads.slice(0, 5);
    if (!batch.length) return;
    setFindingEmails(true);
    setEmailLog(prev => [...prev, `Searching ${batch.length} site${batch.length !== 1 ? 's' : ''} for emails...`]);
    try {
      const result = await api.leadGenEmails(batch.map(l => l.id));
      result.results.forEach(r => {
        setEmailLog(prev => [...prev, r.email ? `✓ ${r.businessName}: ${r.email}` : `✗ ${r.businessName}: not found`]);
      });
      await onRefresh();
    } catch (err) {
      setEmailLog(prev => [...prev, `Error: ${err.message}`]);
    } finally {
      setFindingEmails(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-4">
        <h1 className="text-lg font-bold text-slate-900">Lead Generation</h1>
        <p className="text-slate-500 text-sm">Find and qualify new leads via Google Places</p>
      </div>

      <div className="p-6 space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-2">
          <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
          <p className="text-amber-800 text-sm">
            <strong>Under construction.</strong> Requires <code className="text-xs bg-amber-100 px-1 rounded">GOOGLE_API_KEY</code> in Netlify environment variables with Places API and PageSpeed Insights API enabled.
          </p>
        </div>

        <StepCard number="1" title="Find Leads" Icon={Search}>
          <div className="flex gap-3 mb-3">
            <input
              type="text"
              placeholder="Industry (e.g. plumber, restaurant)"
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
              className="w-40 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleFind}
              disabled={finding || !industry.trim() || !city.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {finding ? 'Searching…' : 'Find Leads'}
            </button>
          </div>

          {findResult && (
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              {findResult.error ? (
                <p className="text-red-600 text-sm">{findResult.error}</p>
              ) : (
                <>
                  <p className="text-slate-700 text-sm">
                    Found <strong>{findResult.count}</strong> new lead{findResult.count !== 1 ? 's' : ''} added to sheet
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
        </StepCard>

        <StepCard number="2" title="Score Websites" Icon={Zap}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-600 text-sm">
              {unscoredLeads.length > 0
                ? <><strong>{unscoredLeads.length}</strong> lead{unscoredLeads.length !== 1 ? 's' : ''} without a priority score</>
                : 'All leads scored'
              }
            </p>
            <button
              onClick={handleScore}
              disabled={scoring || unscoredLeads.length === 0}
              className="px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {scoring ? 'Scoring…' : `Score next ${Math.min(5, unscoredLeads.length)}`}
            </button>
          </div>
          {scoreLog.length > 0 && (
            <div className="space-y-1 max-h-28 overflow-y-auto">
              {scoreLog.map((line, i) => <p key={i} className="text-xs text-slate-500 font-mono">{line}</p>)}
            </div>
          )}
        </StepCard>

        <StepCard number="3" title="Find Emails" Icon={Mail}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-600 text-sm">
              {noEmailLeads.length > 0
                ? <><strong>{noEmailLeads.length}</strong> lead{noEmailLeads.length !== 1 ? 's' : ''} without an email</>
                : 'All leads have emails'
              }
            </p>
            <button
              onClick={handleFindEmails}
              disabled={findingEmails || noEmailLeads.length === 0}
              className="px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {findingEmails ? 'Searching…' : `Find next ${Math.min(5, noEmailLeads.length)} emails`}
            </button>
          </div>
          {emailLog.length > 0 && (
            <div className="space-y-1 max-h-28 overflow-y-auto">
              {emailLog.map((line, i) => <p key={i} className="text-xs text-slate-500 font-mono">{line}</p>)}
            </div>
          )}
        </StepCard>
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
