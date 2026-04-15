import { useState, useEffect } from 'react';
import { LayoutDashboard, Users, CheckSquare, FileText, Globe, Settings, PlusCircle, Mail, BookOpen } from 'lucide-react';
import { api } from '../utils/api';

const NAV = [
  { id: 'dashboard', label: 'Dashboard',      Icon: LayoutDashboard },
  { id: 'leads',     label: 'All Leads',      Icon: Users            },
  { id: 'customers', label: 'Live Customers', Icon: Globe            },
  { id: 'tasks',     label: 'Tasks',          Icon: CheckSquare      },
  { id: 'contracts', label: 'Contracts',      Icon: FileText         },
  { id: 'documents', label: 'Internal Docs',  Icon: BookOpen         },
];

export default function Sidebar({ view, setView, analytics, onSetup, onEnterLead }) {
  const overdueCount = analytics?.overdueTasksCount || 0;
  const todayCount   = analytics?.todayTasksCount   || 0;

  const [emailUsage, setEmailUsage] = useState(null);

  useEffect(() => {
    api.getEmailUsage().then(setEmailUsage).catch(() => {});
  }, []);

  return (
    <aside className="group w-16 hover:w-60 transition-all duration-200 bg-slate-900 flex flex-col h-screen shrink-0">

      {/* Logo */}
      <div className="px-3 py-5 border-b border-slate-700/60 flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
          <span className="text-white font-bold text-xs">A</span>
        </div>
        <div className="max-w-0 group-hover:max-w-[12rem] overflow-hidden opacity-0 group-hover:opacity-100 transition-all duration-150 whitespace-nowrap">
          <p className="text-white font-bold text-sm leading-tight">Aventra CRM</p>
          <p className="text-slate-400 text-xs">Lead Pipeline</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto scrollbar-thin">
        {NAV.map(({ id, label, Icon }) => {
          const active = view === id;
          return (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${active
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                }`}
            >
              {/* Icon — with small dot badge when collapsed */}
              <span className="relative shrink-0">
                <Icon size={16} />
                {id === 'tasks' && (overdueCount > 0 || todayCount > 0) && (
                  <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full group-hover:hidden
                    ${overdueCount > 0 ? 'bg-red-500' : 'bg-amber-500'}`}
                  />
                )}
              </span>

              {/* Label */}
              <span className="max-w-0 group-hover:max-w-[10rem] overflow-hidden opacity-0 group-hover:opacity-100 transition-all duration-150 whitespace-nowrap">
                {label}
              </span>

              {/* Numeric badge — shown expanded only */}
              {id === 'tasks' && (overdueCount > 0 || todayCount > 0) && (
                <span className={`ml-auto hidden group-hover:inline text-xs px-1.5 py-0.5 rounded-full font-semibold
                  ${overdueCount > 0 ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'}`}>
                  {overdueCount > 0 ? overdueCount : todayCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-2 pb-3 pt-2 border-t border-slate-700/60 space-y-2">
        <button
          onClick={onEnterLead}
          className="w-full flex items-center gap-2 px-2.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors"
        >
          <PlusCircle size={13} className="shrink-0" />
          <span className="max-w-0 group-hover:max-w-[10rem] overflow-hidden opacity-0 group-hover:opacity-100 transition-all duration-150 whitespace-nowrap">
            Enter Lead
          </span>
        </button>

        {analytics && (
          <div className="hidden group-hover:grid grid-cols-2 gap-2 text-center">
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

        {emailUsage && (() => {
          const { used, limit } = emailUsage.monthly;
          const pct = Math.min((used / limit) * 100, 100);
          const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
          return (
            <div className="hidden group-hover:block space-y-1.5 px-1">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Mail size={11} />
                  Email Usage
                </span>
                <span className="text-xs text-slate-400 tabular-nums">{used} / {limit.toLocaleString()}</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
              </div>
              <p className="text-slate-600 text-xs">free emails this month</p>
            </div>
          );
        })()}

        <button
          onClick={onSetup}
          className="w-full flex items-center gap-2 px-2.5 py-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg text-xs font-medium transition-colors"
        >
          <Settings size={13} className="shrink-0" />
          <span className="max-w-0 group-hover:max-w-[10rem] overflow-hidden opacity-0 group-hover:opacity-100 transition-all duration-150 whitespace-nowrap">
            Setup Sheets
          </span>
        </button>
      </div>
    </aside>
  );
}
