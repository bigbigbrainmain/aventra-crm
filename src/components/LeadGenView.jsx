import { useState } from 'react';
import { Zap, Search, Globe, Mail, ChevronDown, AlertTriangle, CheckCircle2, XCircle, Loader2, RotateCcw } from 'lucide-react';
import { api } from '../utils/api';

const INDUSTRIES = [
  'plumber', 'electrician', 'builder', 'roofer', 'painter decorator',
  'plasterer', 'carpenter', 'joiner', 'locksmith', 'glazier',
  'gas engineer', 'boiler repair', 'damp proofing', 'scaffolding',
  'paving contractor', 'fencing contractor', 'loft conversion',
  'landscaper', 'gardener', 'tree surgeon', 'window cleaner',
  'cleaning service', 'carpet cleaning', 'pest control', 'removal company',
  'hair salon', 'barber', 'beauty salon', 'nail salon', 'tattoo studio',
  'tanning salon', 'massage therapist', 'physiotherapist', 'chiropractor',
  'osteopath', 'personal trainer', 'yoga studio', 'dentist', 'optician',
  'restaurant', 'cafe', 'takeaway', 'pizza', 'indian restaurant',
  'chinese restaurant', 'fish and chips', 'pub', 'bakery', 'butcher',
  'accountant', 'solicitor', 'estate agent', 'mortgage broker',
  'financial advisor', 'driving instructor', 'tutor',
  'car garage', 'mot centre', 'tyre fitting', 'car valeting',
  'auto electrician', 'windscreen repair',
  'florist', 'pet groomer', 'dog groomer', 'vet', 'pharmacy',
  'dry cleaner', 'printing service', 'photography',
];

const CITIES = [
  'Manchester', 'Birmingham', 'Leeds', 'Sheffield', 'Liverpool',
  'Bristol', 'Newcastle', 'Nottingham', 'Leicester', 'Coventry',
  'Plymouth', 'Southampton', 'Portsmouth', 'Brighton', 'Norwich',
  'Oxford', 'Cambridge', 'Exeter', 'Derby', 'Stoke-on-Trent',
  'Glasgow', 'Edinburgh', 'Cardiff', 'Swansea', 'Belfast',
  'Reading', 'Milton Keynes', 'Northampton', 'Luton', 'Watford',
  'Swindon', 'Wolverhampton', 'Preston', 'Blackpool', 'Middlesbrough',
  'Sunderland', 'Durham', 'Ipswich', 'Peterborough', 'Gloucester',
  'Cheltenham', 'Worcester', 'Hereford', 'Shrewsbury', 'Chester',
  'Warrington', 'Bolton', 'Wigan', 'Burnley', 'Blackburn',
  'Huddersfield', 'Bradford', 'Hull', 'York', 'Scarborough',
  'Lincoln', 'Grimsby', 'Doncaster', 'Rotherham', 'Barnsley',
  'Wakefield', 'Harrogate', 'Carlisle', 'Lancaster', 'Kendal',
  'Stockport', 'Salford', 'Oldham', 'Rochdale', 'Bury',
  'Guildford', 'Crawley', 'Worthing', 'Eastbourne', 'Hastings',
  'Maidstone', 'Canterbury', 'Folkestone', 'Dover',
  'Colchester', 'Southend-on-Sea', 'Chelmsford', 'Basildon',
  'Telford', 'Stafford', 'Burton-on-Trent', 'Tamworth', 'Walsall',
  'West Bromwich', 'Dudley', 'Solihull', 'Redditch', 'Kidderminster',
  'Torquay', 'Paignton', 'Barnstaple', 'Truro', 'Penzance',
  'Yeovil', 'Taunton', 'Weston-super-Mare', 'Bath', 'Chippenham',
  'Salisbury', 'Basingstoke', 'Winchester', 'Bournemouth', 'Poole',
  'Weymouth', 'Dorchester', 'Bridgwater',
];

const PRIORITY_COLOURS = {
  '🔴 Priority 1': 'text-red-600',
  '🟠 Priority 2': 'text-orange-600',
  '🟡 Priority 3': 'text-yellow-600',
  '🟢 Skip': 'text-green-600',
};

function stepInitial() {
  return { status: 'idle', result: null, error: null };
}

function LogEntry({ entry }) {
  const icons = { success: <CheckCircle2 size={13} className="text-green-500 shrink-0 mt-0.5" />, error: <XCircle size={13} className="text-red-500 shrink-0 mt-0.5" />, info: <span className="w-3.5 h-3.5 shrink-0 mt-0.5" /> };
  return (
    <div className="flex items-start gap-2 text-xs text-slate-600">
      {icons[entry.type] || icons.info}
      <span>{entry.message}</span>
    </div>
  );
}

export default function LeadGenView() {
  const [industry, setIndustry] = useState('');
  const [city, setCity] = useState('');
  const [step1, setStep1] = useState(stepInitial());
  const [step2, setStep2] = useState(stepInitial());
  const [step3, setStep3] = useState(stepInitial());
  const [log, setLog] = useState([]);

  function addLog(message, type = 'info') {
    setLog(prev => [{ message, type, id: Date.now() + Math.random() }, ...prev].slice(0, 50));
  }

  async function runFind() {
    if (!industry.trim() || !city.trim()) return;
    setStep1({ status: 'loading', result: null, error: null });
    addLog(`Searching for "${industry}" in ${city}…`);
    try {
      const result = await api.leadGenFind(industry.trim(), city.trim());
      setStep1({ status: 'done', result, error: null });
      addLog(`Found ${result.total} places — added ${result.added} new to sheet`, 'success');
      result.names?.forEach(n => addLog(`  + ${n}`, 'success'));
    } catch (err) {
      setStep1({ status: 'error', result: null, error: err.message });
      addLog(`Find failed: ${err.message}`, 'error');
    }
  }

  async function runScore() {
    setStep2(s => ({ ...s, status: 'loading', error: null }));
    addLog('Scoring websites (up to 5 at a time)…');
    try {
      const result = await api.leadGenScore();
      setStep2({ status: 'done', result, error: null });
      if (result.scored === 0) {
        addLog('No unscored leads found — all done!', 'success');
      } else {
        addLog(`Scored ${result.scored} leads (${result.remaining} remaining)`, 'success');
        result.results?.forEach(r => {
          const colour = PRIORITY_COLOURS[r.priority] || '';
          addLog(`  ${r.name}: ${r.priority} — ${r.reason}`);
        });
      }
    } catch (err) {
      setStep2({ status: 'error', result: null, error: err.message });
      addLog(`Score failed: ${err.message}`, 'error');
    }
  }

  async function runEmails() {
    setStep3(s => ({ ...s, status: 'loading', error: null }));
    addLog('Finding emails (up to 5 at a time)…');
    try {
      const result = await api.leadGenEmails();
      setStep3({ status: 'done', result, error: null });
      if (result.found === 0 && result.results?.length === 0) {
        addLog('No leads need emails — all done!', 'success');
      } else {
        addLog(`Found ${result.found}/${result.results?.length || 0} emails (${result.remaining} remaining)`, 'success');
        result.results?.forEach(r => {
          if (r.email) addLog(`  ${r.name}: ${r.email} (via ${r.source})`, 'success');
          else addLog(`  ${r.name}: no email found`);
        });
      }
    } catch (err) {
      setStep3({ status: 'error', result: null, error: err.message });
      addLog(`Email search failed: ${err.message}`, 'error');
    }
  }

  const scoreHasMore = step2.result?.remaining > 0;
  const emailHasMore = step3.result?.remaining > 0;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">

      {/* Under construction banner */}
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800">
          <span className="font-semibold">Currently under construction</span> — this feature is not yet functional. Add{' '}
          <code className="bg-amber-100 px-1 rounded text-xs font-mono">GOOGLE_API_KEY</code> to your Netlify environment variables to enable it.
        </p>
      </div>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Zap size={20} className="text-blue-600" />
          <h1 className="text-xl font-bold text-slate-900">Bulk Lead Generation</h1>
        </div>
        <p className="text-sm text-slate-500">Search Google Places, score websites, and find emails — all added straight to your sheet.</p>
      </div>

      {/* Search inputs */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">Search parameters</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Industry</label>
            <input
              list="industries-list"
              value={industry}
              onChange={e => setIndustry(e.target.value)}
              placeholder="e.g. plumber"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <datalist id="industries-list">
              {INDUSTRIES.map(i => <option key={i} value={i} />)}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">City</label>
            <input
              list="cities-list"
              value={city}
              onChange={e => setCity(e.target.value)}
              placeholder="e.g. Manchester"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <datalist id="cities-list">
              {CITIES.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
        </div>
      </div>

      {/* Step cards */}
      <div className="space-y-3">

        {/* Step 1: Find leads */}
        <StepCard
          icon={<Search size={15} />}
          number="1"
          title="Find Leads"
          description="Query Google Places for businesses matching your industry + city and add new ones to the sheet."
          state={step1}
          disabled={!industry.trim() || !city.trim()}
          disabledReason={!industry.trim() || !city.trim() ? 'Enter an industry and city above first' : ''}
          buttonLabel="Find Leads"
          onRun={runFind}
          result={step1.result && (
            <span className="font-medium">{step1.result.added} added</span>
          )}
        />

        {/* Step 2: Score websites */}
        <StepCard
          icon={<Globe size={15} />}
          number="2"
          title="Score Websites"
          description="Check each lead's website for SSL, mobile performance and copyright staleness — assigns priority tiers."
          state={step2}
          buttonLabel={scoreHasMore ? `Score Next 5 (${step2.result.remaining} remaining)` : 'Score Websites'}
          onRun={runScore}
          result={step2.result?.scored > 0 && (
            <span className="font-medium">{step2.result.scored} scored</span>
          )}
          allowRerun={scoreHasMore}
        />

        {/* Step 3: Find emails */}
        <StepCard
          icon={<Mail size={15} />}
          number="3"
          title="Find Emails"
          description="Scrape each priority lead's own website and Bing search results to find contact email addresses."
          state={step3}
          buttonLabel={emailHasMore ? `Find Next 5 (${step3.result.remaining} remaining)` : 'Find Emails'}
          onRun={runEmails}
          result={step3.result && (
            <span className="font-medium">{step3.result.found}/{step3.result.results?.length || 0} found</span>
          )}
          allowRerun={emailHasMore}
        />
      </div>

      {/* Activity log */}
      {log.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-1.5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Activity</p>
            <button onClick={() => setLog([])} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">Clear</button>
          </div>
          {log.map(entry => <LogEntry key={entry.id} entry={entry} />)}
        </div>
      )}
    </div>
  );
}

function StepCard({ icon, number, title, description, state, disabled, disabledReason, buttonLabel, onRun, result, allowRerun }) {
  const isLoading = state.status === 'loading';
  const isDone = state.status === 'done';
  const isError = state.status === 'error';

  return (
    <div className={`bg-white rounded-xl border p-4 transition-colors ${isError ? 'border-red-200' : isDone && !allowRerun ? 'border-green-200' : 'border-slate-200'}`}>
      <div className="flex items-start gap-3">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-white text-xs font-bold
          ${isError ? 'bg-red-500' : isDone && !allowRerun ? 'bg-green-500' : 'bg-blue-600'}`}>
          {isDone && !allowRerun ? <CheckCircle2 size={14} /> : icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-slate-800">{title}</p>
            {result && isDone && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{result}</span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
          {isError && (
            <p className="text-xs text-red-600 mt-1 font-medium">{state.error}</p>
          )}
          {disabled && disabledReason && (
            <p className="text-xs text-slate-400 mt-1">{disabledReason}</p>
          )}
        </div>
        <button
          onClick={onRun}
          disabled={isLoading || disabled}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
            ${isLoading || disabled
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : allowRerun
                ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                : isDone
                  ? 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
        >
          {isLoading ? (
            <><Loader2 size={12} className="animate-spin" /> Running…</>
          ) : allowRerun ? (
            <><RotateCcw size={12} /> {buttonLabel}</>
          ) : (
            buttonLabel
          )}
        </button>
      </div>
    </div>
  );
}
