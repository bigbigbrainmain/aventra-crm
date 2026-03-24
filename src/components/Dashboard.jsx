import { ArrowRight, AlertTriangle, Clock, TrendingUp } from 'lucide-react';
import { getStatusStyle, getPriorityStyle, formatDate, isDueToday, isOverdue, STATUSES } from '../utils/constants';

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

function PriorityBadge({ priority }) {
  const p = getPriorityStyle(priority);
  if (!p) return null;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${p.bg} ${p.text}`}>
      {p.label}
    </span>
  );
}

export default function Dashboard({ leads, tasks, analytics, onSelectLead, setView }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayTasks = tasks.filter(t => !t.completed && isDueToday(t.dueDate));
  const overdueTasks = tasks.filter(t => !t.completed && isOverdue(t.dueDate));
  const recentLeads = [...leads]
    .sort((a, b) => (b.id > a.id ? 1 : -1))
    .slice(0, 6);

  const leadById = Object.fromEntries(leads.map(l => [l.id, l]));

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900">Dashboard</h2>
        <p className="text-slate-500 text-sm mt-1">
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <StatCard label="Total Leads" value={analytics?.totalLeads || 0} onClick={() => setView('leads')} />
        <StatCard label="New" value={analytics?.byStatus?.['New'] || 0} color="text-slate-600" onClick={() => setView('leads')} />
        <StatCard label="Emailed" value={analytics?.byStatus?.['Emailed'] || 0} color="text-blue-600" onClick={() => setView('leads')} />
        <StatCard label="Called" value={analytics?.byStatus?.['Called'] || 0} color="text-purple-600" onClick={() => setView('leads')} />
        <StatCard label="Booked" value={analytics?.byStatus?.['Booked'] || 0} color="text-amber-600" onClick={() => setView('leads')} />
        <StatCard label="Live/Paid" value={analytics?.byStatus?.['Live/Paid'] || 0} color="text-green-600" onClick={() => setView('leads')} />
      </div>

      {/* Priority breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {['🔴 Priority 1', '🟠 Priority 2', '🟡 Priority 3'].map(p => {
          const cfg = getPriorityStyle(p);
          const count = analytics?.byPriority?.[p] || 0;
          return (
            <div key={p} className={`rounded-xl p-4 ${cfg?.bg || 'bg-slate-50'} border border-slate-100`}>
              <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${cfg?.text || 'text-slate-500'}`}>
                {p}
              </p>
              <p className={`text-2xl font-bold ${cfg?.text || 'text-slate-900'}`}>{count}</p>
              <p className="text-xs text-slate-500 mt-0.5">leads</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tasks panel */}
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
                    <div className="flex items-center gap-1.5 shrink-0">
                      {lead.priority && <PriorityBadge priority={lead.priority} />}
                      <StatusBadge status={lead.status} />
                    </div>
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
