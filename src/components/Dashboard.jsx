import { useState } from 'react';
import { ArrowRight, AlertTriangle, Clock, TrendingUp, ChevronDown } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell,
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

function getLastNMonths(n) {
  const months = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
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
    </div>
  );
};

const RANGE_OPTIONS = [
  { label: 'Last 3 months',  value: 3  },
  { label: 'Last 6 months',  value: 6  },
  { label: 'Last 12 months', value: 12 },
];

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

export default function Dashboard({ leads, tasks, analytics, onSelectLead, setView }) {
  const [closedWonRange, setClosedWonRange] = useState(6);
  const [activityRange, setActivityRange] = useState(6);

  const todayTasks = tasks.filter(t => !t.completed && isDueToday(t.dueDate));
  const overdueTasks = tasks.filter(t => !t.completed && isOverdue(t.dueDate));
  const recentLeads = [...leads].sort((a, b) => (b.id > a.id ? 1 : -1)).slice(0, 6);
  const leadById = Object.fromEntries(leads.map(l => [l.id, l]));

  const closedWonMonths = getLastNMonths(closedWonRange);
  const activityMonths = getLastNMonths(activityRange);

  // Stacked bar: leads pitched per month by status
  const pipelineActivity = activityMonths.map(m => {
    const ml = leads.filter(l => getLeadMonth(l) === m.key);
    const row = { month: m.label };
    Object.keys(STATUS_COLORS).forEach(s => {
      row[s] = ml.filter(l => l.status === s).length;
    });
    return row;
  });

  // Simple bar: closed won per month
  const closedWonByMonth = closedWonMonths.map(m => ({
    month: m.label,
    'Closed Won': leads.filter(l => l.status === 'Closed Won' && getLeadMonth(l) === m.key).length,
  }));

  // Funnel
  const totalLeads = analytics?.totalLeads || 1;
  const funnelData = FUNNEL_STAGES.map(s => {
    const count = analytics?.byStatus?.[s] || 0;
    return { stage: s, count, pct: Math.round((count / totalLeads) * 100) };
  });

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900">Dashboard</h2>
        <p className="text-slate-500 text-sm mt-1">
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <StatCard label="Total Leads" value={analytics?.totalLeads || 0} onClick={() => setView('leads')} />
        <StatCard label="New" value={analytics?.byStatus?.['New'] || 0} color="text-slate-500" onClick={() => setView('leads')} />
        <StatCard label="Working" value={analytics?.byStatus?.['Working'] || 0} color="text-blue-600" onClick={() => setView('leads')} />
        <StatCard label="HOT" value={analytics?.byStatus?.['HOT'] || 0} color="text-orange-600" onClick={() => setView('leads')} />
        <StatCard label="Booked" value={analytics?.byStatus?.['Booked'] || 0} color="text-amber-600" onClick={() => setView('leads')} />
        <StatCard label="Closed Won" value={analytics?.byStatus?.['Closed Won'] || 0} color="text-green-600" onClick={() => setView('leads')} />
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
          <p className="text-xs text-slate-400 mb-4">Based on date pitched</p>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={closedWonByMonth} barSize={34} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="Closed Won" radius={[4, 4, 0, 0]}>
                {closedWonByMonth.map((_, i) => <Cell key={i} fill="#4ade80" />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Pipeline activity stacked bar */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 mb-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-slate-900">Pipeline Activity</h3>
          <TimelineDropdown value={activityRange} onChange={setActivityRange} />
        </div>
        <p className="text-xs text-slate-400 mb-4">Leads pitched per month by current status</p>
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
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
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
    </div>
  );
}
