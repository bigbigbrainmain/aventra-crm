import { useState } from 'react';
import { ArrowRight, AlertTriangle, Clock, TrendingUp, ChevronDown, X, PoundSterling } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell, ComposedChart, Line,
} from 'recharts';
import { getStatusStyle, isDueToday, isOverdue } from '../utils/constants';

const STATUS_COLORS = {
  'New':        '#94a3b8',
  'Working':    '#60a5fa',
  'HOT':        '#fb923c',
  'Booked':     '#fbbf24',
  'Closed Won': '#4ade80',
  'Lost':       '#f87171',
};

const FUNNEL_STAGES = ['New', 'Working', 'HOT', 'Booked', 'Closed Won'];

const RANGE_OPTIONS = [
  { label: 'Last 3 months',  value: 3  },
  { label: 'Last 6 months',  value: 6  },
  { label: 'Last 12 months', value: 12 },
];

// ─── helpers ────────────────────────────────────────────────────────────────

function getLastNMonths(n) {
  const months = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    months.push({
      key:   `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
    });
  }
  return months;
}

function getLeadMonth(lead) {
  if (!lead.datePitched) return null;
  const d = new Date(lead.datePitched);
  if (isNaN(d)) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function parseMonthlyFee(raw) {
  if (!raw) return null;
  const n = parseFloat(String(raw).replace(/[^0-9.]/g, ''));
  return isNaN(n) ? null : n;
}

function matchCustomer(lead, customers) {
  return customers?.find(
    c => c.businessName.toLowerCase().trim() === lead.businessName.toLowerCase().trim()
  ) || null;
}

// ─── small components ────────────────────────────────────────────────────────

function StatCard({ label, value, color = 'text-slate-900', onClick }) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-xl p-5 shadow-sm border border-slate-100 text-left hover:shadow-md hover:border-blue-200 transition-all"
    >
      <p className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
    </button>
  );
}

function StatusBadge({ status }) {
  const s = getStatusStyle(status);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}

function TimelineDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const selected = RANGE_OPTIONS.find(o => o.value === value);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1.5 transition-colors"
      >
        {selected?.label}
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-10 min-w-[140px]">
          {RANGE_OPTIONS.map(o => (
            <button
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 first:rounded-t-lg last:rounded-b-lg transition-colors ${o.value === value ? 'font-semibold text-blue-600' : 'text-slate-700'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-slate-700 mb-2">{label}</p>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-0.5">
          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: p.fill || p.color }} />
          <span className="text-slate-600">{p.name}:</span>
          <span className="font-medium text-slate-800">{p.value}</span>
        </div>
      ))}
      <p className="text-slate-400 mt-2 italic">Click to see details</p>
    </div>
  );
};

// ─── income chart helpers ────────────────────────────────────────────────────

function getIncomeByMonth(months, customers, customerAddons, addonsMap) {
  return months.map(m => {
    const [y, mo] = m.key.split('-').map(Number);
    const monthEnd   = new Date(y, mo, 0);   // last day of month
    const monthStart = new Date(y, mo - 1, 1);

    const baseMrr = customers
      .filter(c => {
        if (!c.goLiveDate) return true;
        const d = new Date(c.goLiveDate);
        return !isNaN(d) && d <= monthEnd;
      })
      .reduce((sum, c) => sum + (parseFloat(c.monthlyFee) || 0), 0);

    const addonMrr = customerAddons
      .filter(ca => {
        if (!ca.startDate) return false;
        const d = new Date(ca.startDate);
        return !isNaN(d) && d <= monthEnd;
      })
      .reduce((sum, ca) => {
        const catalog = addonsMap[ca.addonId] || {};
        const fee = ca.customMonthlyFee !== ''
          ? parseFloat(ca.customMonthlyFee) || 0
          : parseFloat(catalog.monthlyFee) || 0;
        return sum + fee;
      }, 0);

    const oneOff = customerAddons
      .filter(ca => {
        if (!ca.startDate) return false;
        const d = new Date(ca.startDate);
        return !isNaN(d) && d >= monthStart && d <= monthEnd;
      })
      .reduce((sum, ca) => {
        const catalog = addonsMap[ca.addonId] || {};
        const fee = ca.customOneOffFee !== ''
          ? parseFloat(ca.customOneOffFee) || 0
          : parseFloat(catalog.oneOffFee) || 0;
        return sum + fee;
      }, 0);

    return {
      month: m.label,
      monthKey: m.key,
      'Base MRR':     Math.round(baseMrr),
      'Add-on MRR':   Math.round(addonMrr),
      'One-off Fees': Math.round(oneOff),
    };
  });
}

function IncomeTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((sum, p) => sum + (p.value || 0), 0);
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs min-w-[160px]">
      <p className="font-semibold text-slate-700 mb-2">{label}</p>
      {payload.map(p => p.value > 0 && (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 mb-0.5">
          <span className="flex items-center gap-1.5 text-slate-600">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.fill }} />
            {p.name}
          </span>
          <span className="font-medium text-slate-800">£{p.value.toLocaleString()}</span>
        </div>
      ))}
      {total > 0 && (
        <div className="border-t border-slate-100 mt-2 pt-2 flex items-center justify-between">
          <span className="text-slate-500 font-medium">Total</span>
          <span className="font-bold text-slate-900">£{total.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}

// ─── drilldown modal ─────────────────────────────────────────────────────────

function DrilldownModal({ leads, customers, drilldown, onClose, onSelectLead }) {
  if (!drilldown) return null;

  const { monthLabel, monthKey, status } = drilldown;

  const matchedLeads = leads.filter(
    l => getLeadMonth(l) === monthKey && l.status === status
  );

  const leadsWithValues = matchedLeads.map(lead => {
    const customer = matchCustomer(lead, customers);
    const fee = parseMonthlyFee(customer?.monthlyFee);
    return { ...lead, monthlyFee: fee, annualValue: fee !== null ? fee * 12 : null };
  });

  const totalAnnual = leadsWithValues.reduce((sum, l) => sum + (l.annualValue ?? 0), 0);
  const hasValues = leadsWithValues.some(l => l.annualValue !== null);

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLORS[status] }} />
              <h3 className="font-semibold text-slate-900">{status}</h3>
              <span className="text-slate-400 text-sm">·</span>
              <span className="text-sm text-slate-500">{monthLabel}</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {matchedLeads.length} lead{matchedLeads.length !== 1 ? 's' : ''}
              {hasValues && totalAnnual > 0 && (
                <> · <span className="text-green-700 font-semibold">£{totalAnnual.toLocaleString()} total annual value</span></>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors ml-4 shrink-0"
          >
            <X size={15} className="text-slate-400" />
          </button>
        </div>

        {/* list */}
        <div className="p-3 overflow-y-auto max-h-[420px]">
          {matchedLeads.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-10">No leads for this period</p>
          ) : (
            <div className="space-y-2">
              {leadsWithValues.map(lead => (
                <button
                  key={lead.id}
                  onClick={() => { onSelectLead(lead); onClose(); }}
                  className="w-full text-left p-3 rounded-xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50/40 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate group-hover:text-blue-700 transition-colors">
                        {lead.businessName}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">{lead.industry} · {lead.city}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      {lead.annualValue !== null ? (
                        <>
                          <p className="text-sm font-bold text-green-700">£{lead.annualValue.toLocaleString()}</p>
                          <p className="text-xs text-slate-400">£{lead.monthlyFee}/mo × 12</p>
                        </>
                      ) : (
                        <StatusBadge status={lead.status} />
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* footer total */}
        {hasValues && totalAnnual > 0 && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <PoundSterling size={12} />
              Total annual contract value
            </div>
            <p className="text-base font-bold text-green-700">£{totalAnnual.toLocaleString()}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── main dashboard ──────────────────────────────────────────────────────────

export default function Dashboard({ leads, tasks, analytics, customers = [], addons = [], customerAddons = [], onSelectLead, setView }) {
  const [closedWonRange, setClosedWonRange] = useState(6);
  const [activityRange, setActivityRange]   = useState(6);
  const [incomeRange, setIncomeRange]       = useState(12);
  const [drilldown, setDrilldown]           = useState(null);

  const todayTasks    = tasks.filter(t => !t.completed && isDueToday(t.dueDate));
  const overdueTasks  = tasks.filter(t => !t.completed && isOverdue(t.dueDate));
  const recentLeads   = [...leads].sort((a, b) => (b.id > a.id ? 1 : -1)).slice(0, 6);
  const leadById      = Object.fromEntries(leads.map(l => [l.id, l]));

  const closedWonMonths = getLastNMonths(closedWonRange);
  const activityMonths  = getLastNMonths(activityRange);

  const pipelineActivity = activityMonths.map(m => {
    const ml  = leads.filter(l => getLeadMonth(l) === m.key);
    const row = { month: m.label, monthKey: m.key };
    Object.keys(STATUS_COLORS).forEach(s => { row[s] = ml.filter(l => l.status === s).length; });
    return row;
  });

  const closedWonByMonth = closedWonMonths.map(m => ({
    month: m.label,
    monthKey: m.key,
    'Closed Won': leads.filter(l => l.status === 'Closed Won' && getLeadMonth(l) === m.key).length,
  }));

  const totalLeads = analytics?.totalLeads || 1;
  const funnelData = FUNNEL_STAGES.map(s => {
    const count = analytics?.byStatus?.[s] || 0;
    return { stage: s, count, pct: Math.round((count / totalLeads) * 100) };
  });

  const openDrilldown = (monthKey, monthLabel, status, count) => {
    if (!count) return;
    setDrilldown({ monthKey, monthLabel, status });
  };

  const incomeMonths  = getLastNMonths(incomeRange);
  const addonsMap     = Object.fromEntries(addons.map(a => [a.id, a]));
  const incomeData    = getIncomeByMonth(incomeMonths, customers, customerAddons, addonsMap);
  const hasIncomeData = incomeData.some(d => d['Base MRR'] > 0 || d['Add-on MRR'] > 0 || d['One-off Fees'] > 0);

  const currentMrr = customers
    .filter(c => c.status === 'Active')
    .reduce((sum, c) => sum + (parseFloat(c.monthlyFee) || 0), 0)
    + customerAddons.reduce((sum, ca) => {
      const catalog = addonsMap[ca.addonId] || {};
      const fee = ca.customMonthlyFee !== ''
        ? parseFloat(ca.customMonthlyFee) || 0
        : parseFloat(catalog.monthlyFee) || 0;
      return sum + fee;
    }, 0);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900">Dashboard</h2>
        <p className="text-slate-500 text-sm mt-1">
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4 mb-8">
        <StatCard label="Total Leads"  value={analytics?.totalLeads || 0}                         onClick={() => setView('leads')} />
        <StatCard label="New"          value={analytics?.byStatus?.['New'] || 0}        color="text-slate-500"  onClick={() => setView('leads')} />
        <StatCard label="Working"      value={analytics?.byStatus?.['Working'] || 0}    color="text-blue-600"   onClick={() => setView('leads')} />
        <StatCard label="HOT"          value={analytics?.byStatus?.['HOT'] || 0}        color="text-orange-600" onClick={() => setView('leads')} />
        <StatCard label="Booked"       value={analytics?.byStatus?.['Booked'] || 0}     color="text-amber-600"  onClick={() => setView('leads')} />
        <StatCard label="Closed Won"   value={analytics?.byStatus?.['Closed Won'] || 0} color="text-green-600"  onClick={() => setView('leads')} />
        <StatCard label="Total MRR"    value={currentMrr > 0 ? `£${currentMrr.toLocaleString()}` : '—'} color="text-emerald-600" onClick={() => setView('customers')} />
      </div>

      {/* Funnel + Closed Won by month */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">

        {/* Pipeline funnel */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-100 p-6">
          <h3 className="font-semibold text-slate-900">Pipeline Funnel</h3>
          <p className="text-xs text-slate-400 mt-0.5 mb-5">All-time stage breakdown</p>
          <div className="space-y-4">
            {funnelData.map(({ stage, count, pct }) => (
              <div key={stage}>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-medium text-slate-700">{stage}</span>
                  <span className="text-slate-400">{count} · {pct}%</span>
                </div>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%`, backgroundColor: STATUS_COLORS[stage] }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Closed Won by month */}
        <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-slate-100 p-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-slate-900">Closed Won by Month</h3>
            <TimelineDropdown value={closedWonRange} onChange={setClosedWonRange} />
          </div>
          <p className="text-xs text-slate-400 mb-4">Based on date pitched · click a bar for details</p>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={closedWonByMonth} barSize={34} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
              <Bar
                dataKey="Closed Won"
                radius={[4, 4, 0, 0]}
                style={{ cursor: 'pointer' }}
                onClick={d => openDrilldown(d.monthKey, d.month, 'Closed Won', d['Closed Won'])}
              >
                {closedWonByMonth.map((_, i) => <Cell key={i} fill="#4ade80" />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Pipeline Activity stacked bar */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 mb-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-slate-900">Pipeline Activity</h3>
          <TimelineDropdown value={activityRange} onChange={setActivityRange} />
        </div>
        <p className="text-xs text-slate-400 mb-4">Leads pitched per month by current status · click a segment for details</p>
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={pipelineActivity} barSize={40} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
            <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
            {Object.entries(STATUS_COLORS).map(([status, color], i, arr) => (
              <Bar
                key={status}
                dataKey={status}
                stackId="a"
                fill={color}
                radius={i === arr.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                style={{ cursor: 'pointer' }}
                onClick={d => openDrilldown(d.monthKey, d.month, status, d[status])}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly Income chart */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 mb-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-slate-900">Monthly Income</h3>
          <TimelineDropdown value={incomeRange} onChange={setIncomeRange} />
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Base MRR counted from customer go-live date · add-on MRR from link start date · one-off fees in the month they were linked
        </p>
        {!hasIncomeData ? (
          <div className="flex items-center justify-center h-[200px] text-slate-300 text-sm">
            No income data yet — add customers with go-live dates to see this chart
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={incomeData} barSize={32} margin={{ top: 4, right: 4, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => v >= 1000 ? `£${(v / 1000).toFixed(1)}k` : `£${v}`}
              />
              <Tooltip content={<IncomeTooltip />} cursor={{ fill: '#f8fafc' }} />
              <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
              <Bar dataKey="Base MRR"     stackId="a" fill="#60a5fa" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Add-on MRR"   stackId="a" fill="#a78bfa" radius={[0, 0, 0, 0]} />
              <Bar dataKey="One-off Fees" stackId="a" fill="#fbbf24" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Tasks + Recent Leads */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Tasks */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <Clock size={16} className="text-slate-400" />
              Today's Tasks
              {todayTasks.length > 0 && (
                <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                  {todayTasks.length}
                </span>
              )}
            </h3>
            <button onClick={() => setView('tasks')} className="text-blue-600 hover:text-blue-700 text-xs font-medium flex items-center gap-1">
              All tasks <ArrowRight size={12} />
            </button>
          </div>

          {overdueTasks.length > 0 && (
            <div className="mb-3 p-3 bg-red-50 border border-red-100 rounded-lg flex items-center gap-2">
              <AlertTriangle size={14} className="text-red-500 shrink-0" />
              <p className="text-red-700 text-xs font-medium">
                {overdueTasks.length} overdue task{overdueTasks.length > 1 ? 's' : ''} — check Tasks view
              </p>
            </div>
          )}

          {todayTasks.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-6">No tasks due today</p>
          ) : (
            <div className="space-y-2">
              {todayTasks.map(task => {
                const lead = leadById[task.leadId];
                return (
                  <button
                    key={task.id}
                    onClick={() => lead && onSelectLead(lead)}
                    className="w-full text-left p-3 rounded-lg border border-slate-100 hover:border-blue-200 hover:bg-blue-50/40 transition-colors"
                  >
                    <p className="text-sm font-medium text-slate-800">{task.description}</p>
                    {lead && <p className="text-xs text-slate-400 mt-0.5">{lead.businessName}</p>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent leads */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <TrendingUp size={16} className="text-slate-400" />
              Recent Leads
            </h3>
            <button onClick={() => setView('leads')} className="text-blue-600 hover:text-blue-700 text-xs font-medium flex items-center gap-1">
              All leads <ArrowRight size={12} />
            </button>
          </div>

          {recentLeads.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-6">No leads yet</p>
          ) : (
            <div className="space-y-2">
              {recentLeads.map(lead => (
                <button
                  key={lead.id}
                  onClick={() => onSelectLead(lead)}
                  className="w-full text-left p-3 rounded-lg border border-slate-100 hover:border-blue-200 hover:bg-blue-50/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{lead.businessName}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{lead.industry} · {lead.city}</p>
                    </div>
                    <StatusBadge status={lead.status} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Drilldown modal */}
      <DrilldownModal
        leads={leads}
        customers={customers}
        drilldown={drilldown}
        onClose={() => setDrilldown(null)}
        onSelectLead={onSelectLead}
      />
    </div>
  );
}
