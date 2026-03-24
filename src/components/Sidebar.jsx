import { LayoutDashboard, Users, CheckSquare, Settings, PlusCircle } from 'lucide-react';

const NAV = [
  { id: 'dashboard', label: 'Dashboard',  Icon: LayoutDashboard },
  { id: 'leads',     label: 'All Leads',  Icon: Users            },
  { id: 'tasks',     label: 'Tasks',      Icon: CheckSquare      },
];

export default function Sidebar({ view, setView, analytics, onSetup, onEnterLead }) {
  const overdueCount = analytics?.overdueTasksCount || 0;
  const todayCount   = analytics?.todayTasksCount   || 0;

  return (
    <aside className="w-60 bg-slate-900 flex flex-col h-screen shrink-0">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-slate-700/60">
        <h1 className="text-white font-bold text-lg tracking-tight">Aventra CRM</h1>
        <p className="text-slate-400 text-xs mt-0.5">Lead Pipeline</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-thin">
        {NAV.map(({ id, label, Icon }) => {
          const active = view === id;
          return (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${active
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                }`}
            >
              <Icon size={16} />
              <span>{label}</span>
              {id === 'tasks' && (overdueCount > 0 || todayCount > 0) && (
                <span className={`ml-auto text-xs px-1.5 py-0.5 rounded-full font-semibold
                  ${overdueCount > 0 ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'}`}>
                  {overdueCount > 0 ? overdueCount : todayCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer stats */}
      <div className="px-4 pb-3 pt-2 border-t border-slate-700/60 space-y-3">
        <button
          onClick={onEnterLead}
          className="w-full flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors"
        >
          <PlusCircle size={13} />
          Enter Lead
        </button>
        {analytics && (
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="bg-slate-800 rounded-lg py-2">
              <p className="text-white font-bold text-lg leading-none">{analytics.totalLeads}</p>
              <p className="text-slate-400 text-xs mt-0.5">Leads</p>
            </div>
            <div className="bg-slate-800 rounded-lg py-2">
              <p className="text-white font-bold text-lg leading-none">{analytics.byStatus?.['Live/Paid'] || 0}</p>
              <p className="text-slate-400 text-xs mt-0.5">Live</p>
            </div>
          </div>
        )}
        <button
          onClick={onSetup}
          className="w-full flex items-center gap-2 px-3 py-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg text-xs font-medium transition-colors"
        >
          <Settings size={13} />
          Setup Sheets
        </button>
      </div>
    </aside>
  );
}
