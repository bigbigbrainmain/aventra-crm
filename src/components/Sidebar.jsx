import { useState, useEffect } from 'react';
import { LayoutDashboard, Users, CheckSquare, FileText, Globe, Settings, PlusCircle, Mail, BookOpen, Pin, Package } from 'lucide-react';
import { api } from '../utils/api';

const NAV = [
  { id: 'dashboard', label: 'Dashboard',      Icon: LayoutDashboard },
  { id: 'leads',     label: 'All Leads',      Icon: Users            },
  { id: 'customers', label: 'Live Customers', Icon: Globe            },
  { id: 'addons',    label: 'Add-ons',        Icon: Package          },
  { id: 'tasks',     label: 'Tasks',          Icon: CheckSquare      },
  { id: 'contracts', label: 'Contracts',      Icon: FileText         },
  { id: 'documents', label: 'Internal Docs',  Icon: BookOpen         },
];

export default function Sidebar({ view, setView, analytics, onSetup, onEnterLead }) {
  const overdueCount = analytics?.overdueTasksCount || 0;
  const todayCount   = analytics?.todayTasksCount   || 0;

  const [emailUsage, setEmailUsage] = useState(null);
  const [pinned, setPinned] = useState(() => {
    try { return localStorage.getItem('crm_sidebarPinned') === 'true'; }
    catch { return false; }
  });

  useEffect(() => {
    api.getEmailUsage().then(setEmailUsage).catch(() => {});
  }, []);

  const togglePin = () => {
    const next = !pinned;
    setPinned(next);
    localStorage.setItem('crm_sidebarPinned', String(next));
  };

  // Helpers: class sets differ between pinned (always expanded) and hover mode
  const expanded   = (cls) => pinned ? cls : '';
  const onHover    = (cls) => pinned ? '' : cls;
  const textCls    = pinned
    ? 'opacity-100 max-w-[12rem]'
    : 'max-w-0 group-hover:max-w-[12rem] opacity-0 group-hover:opacity-100';
  const showCls    = (display) => pinned ? display : `hidden group-hover:${display}`;

  return (
    <aside className={`${pinned ? 'w-60' : 'group w-16 hover:w-60'} transition-all duration-200 bg-slate-900 flex flex-col h-screen shrink-0`}>

      {/* Logo + pin */}
      <div className="px-3 py-5 border-b border-slate-700/60 flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
          <span className="text-white font-bold text-xs">A</span>
        </div>
        <div className={`flex-1 overflow-hidden transition-all duration-150 whitespace-nowrap ${textCls}`}>
          <p className="text-white font-bold text-sm leading-tight">Aventra CRM</p>
          <p className="text-slate-400 text-xs">Lead Pipeline</p>
        </div>
        <button
          onClick={togglePin}
          title={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
          className={`shrink-0 p-1 rounded transition-all duration-150
            ${pinned
              ? 'text-blue-400 hover:text-blue-300'
              : 'text-slate-500 hover:text-slate-300 opacity-0 group-hover:opacity-100'
            }`}
        >
          <Pin size={13} className={pinned ? 'fill-current' : ''} />
        </button>
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
              <span className="relative shrink-0">
                <Icon size={16} />
                {!pinned && id === 'tasks' && (overdueCount > 0 || todayCount > 0) && (
                  <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full group-hover:hidden
                    ${overdueCount > 0 ? 'bg-red-500' : 'bg-amber-500'}`}
                  />
                )}
              </span>
              <span className={`overflow-hidden transition-all duration-150 whitespace-nowrap ${textCls}`}>
                {label}
              </span>
              {id === 'tasks' && (overdueCount > 0 || todayCount > 0) && (
                <span className={`ml-auto text-xs px-1.5 py-0.5 rounded-full font-semibold
                  ${showCls('inline')}
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
          <span className={`overflow-hidden transition-all duration-150 whitespace-nowrap ${textCls}`}>
            Enter Lead
          </span>
        </button>

        {analytics && (
          <div className={`${showCls('grid')} grid-cols-2 gap-2 text-center`}>
            <div className="bg-slate-800 rounded-lg py-2">
              <p className="text-white font-bold text-lg leading-none">{analytics.totalLeads}</p>
              <p className="text-slate-400 text-xs mt-0.5">Leads</p>
            </div>
            <div className="bg-slate-800 rounded-lg py-2">
              <p className="text-white font-bold text-lg leading-none">{analytics.byStatus?.['Closed Won'] || 0}</p>
              <p className="text-slate-400 text-xs mt-0.5">Live</p>
            </div>
          </div>
        )}

        {emailUsage && (() => {
          const { used, limit } = emailUsage.monthly;
          const pct = Math.min((used / limit) * 100, 100);
          const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
          return (
            <div className={`${showCls('block')} space-y-1.5 px-1`}>
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
          <span className={`overflow-hidden transition-all duration-150 whitespace-nowrap ${textCls}`}>
            Setup Sheets
          </span>
        </button>
      </div>
    </aside>
  );
}
