import { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import LeadsView from './components/LeadsView';
import TasksView from './components/TasksView';
import ContractsView from './components/ContractsView';
import CustomersView from './components/CustomersView';
import DocumentsView from './components/DocumentsView';
import AddonsView from './components/AddonsView';
import LeadDetail from './components/LeadDetail';
import EnterLeadModal from './components/EnterLeadModal';
import LoginScreen from './components/LoginScreen';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { api } from './utils/api';

function CRMApp() {
  const { user } = useAuth();
  const [view, setView] = useState('dashboard');
  const [leads, setLeads] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [selectedLead, setSelectedLead] = useState(null);
  const [detailExpanded, setDetailExpanded] = useState(false);
  const [deepLinkThread, setDeepLinkThread] = useState(null);
  const [showEnterLead, setShowEnterLead] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const handleToggleFavourite = useCallback(async (leadId) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;
    const newValue = !lead.isFavourite;
    const apply = (val) => {
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, isFavourite: val } : l));
      setSelectedLead(prev => prev?.id === leadId ? { ...prev, isFavourite: val } : prev);
    };
    apply(newValue);
    try {
      await api.updateLead(leadId, { isFavourite: newValue });
    } catch (err) {
      console.error(err);
      apply(!newValue);
    }
  }, [leads]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [leadsData, tasksData, analyticsData, customersData] = await Promise.all([
        api.getLeads(),
        api.getTasks(),
        api.getAnalytics(),
        api.getCustomers(),
      ]);
      setLeads(leadsData);
      setTasks(tasksData);
      setAnalytics(analyticsData);
      setCustomers(customersData);
    } catch (err) {
      console.error('Failed to load data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [loadData, user]);

  // Deep-link: read hash after leads load, e.g. /#lead=lead_123&thread=abc
  useEffect(() => {
    if (!leads.length) return;
    const hash = window.location.hash;
    if (!hash) return;
    const params = new URLSearchParams(hash.slice(1));
    const leadId = params.get('lead');
    const threadId = params.get('thread');
    if (leadId) {
      const lead = leads.find(l => l.id === leadId);
      if (lead) {
        setView('leads');
        setSelectedLead(lead);
        if (threadId) setDeepLinkThread(threadId);
        window.history.replaceState(null, '', window.location.pathname);
      }
    }
  }, [leads]);

  const handleLeadUpdate = useCallback((updatedLead) => {
    setLeads(prev => prev.map(l => l.id === updatedLead.id ? updatedLead : l));
    setSelectedLead(updatedLead);
  }, []);

  const handleLeadDelete = useCallback((leadId) => {
    setLeads(prev => prev.filter(l => l.id !== leadId));
    setSelectedLead(null);
    loadData(); // refresh analytics
  }, [loadData]);

  // user === undefined means auth is still initialising
  if (user === undefined) return (
    <div className="flex items-center justify-center h-screen bg-slate-50">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!user) return <LoginScreen />;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar
        view={view}
        setView={setView}
        analytics={analytics}
        onEnterLead={() => setShowEnterLead(true)}
        onSetup={async () => {
          try {
            const result = await api.setup();
            alert(result.message);
          } catch (err) {
            alert('Setup failed: ' + err.message);
          }
        }}
      />

      <main className={`flex-1 overflow-y-auto scrollbar-thin transition-all duration-200 ${selectedLead && !detailExpanded ? 'pr-[32rem]' : ''}`}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-slate-500 text-sm">Loading CRM data...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-sm">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-red-600 text-xl">!</span>
              </div>
              <p className="text-slate-800 font-semibold mb-1">Failed to load data</p>
              <p className="text-slate-500 text-sm mb-4">{error}</p>
              <button
                onClick={loadData}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        ) : (
          <>
            {view === 'dashboard' && (
              <Dashboard
                leads={leads}
                tasks={tasks}
                analytics={analytics}
                customers={customers}
                onSelectLead={(lead) => setSelectedLead(lead)}
                setView={setView}
              />
            )}
            {view === 'leads' && (
              <LeadsView
                leads={leads}
                onSelectLead={(lead) => setSelectedLead(lead)}
                onRefresh={loadData}
                onToggleFavourite={handleToggleFavourite}
              />
            )}
            {view === 'tasks' && (
              <TasksView
                tasks={tasks}
                leads={leads}
                onTaskUpdate={loadData}
                onSelectLead={(lead) => setSelectedLead(lead)}
              />
            )}
            {view === 'contracts' && <ContractsView />}
            {view === 'customers' && <CustomersView />}
            {view === 'addons'    && <AddonsView />}
            {view === 'documents' && <DocumentsView />}
          </>
        )}
      </main>

      {showEnterLead && (
        <EnterLeadModal
          onClose={() => setShowEnterLead(false)}
          onSave={async (data) => {
            await api.createLead(data);
            await loadData();
          }}
        />
      )}

      {selectedLead && (
        <LeadDetail
          lead={selectedLead}
          onClose={() => { setSelectedLead(null); setDeepLinkThread(null); setDetailExpanded(false); }}
          onUpdate={handleLeadUpdate}
          onDelete={handleLeadDelete}
          onTasksChange={loadData}
          onToggleFavourite={handleToggleFavourite}
          focusThreadId={deepLinkThread}
          expanded={detailExpanded}
          onToggleExpand={() => setDetailExpanded(v => !v)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CRMApp />
    </AuthProvider>
  );
}
