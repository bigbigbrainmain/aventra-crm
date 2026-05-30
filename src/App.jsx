import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate, useMatch } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import LeadsView from './components/LeadsView';
import TasksView from './components/TasksView';
import ContractsView from './components/ContractsView';
import CustomersView from './components/CustomersView';
import DocumentsView from './components/DocumentsView';
import AddonsView from './components/AddonsView';
import OutreachView from './components/OutreachView';
import LeadGenView from './components/LeadGenView';
import LeadDetail from './components/LeadDetail';
import EnterLeadModal from './components/EnterLeadModal';
import LoginScreen from './components/LoginScreen';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { api } from './utils/api';

function CRMApp() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [leads, setLeads] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [addons, setAddons] = useState([]);
  const [customerAddons, setCustomerAddons] = useState([]);
  const [scheduledEmails, setScheduledEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showEnterLead, setShowEnterLead] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(false);

  const leadMatch = useMatch('/leads/:leadId');
  const selectedLead = leadMatch ? (leads.find(l => l.id === leadMatch.params.leadId) ?? null) : null;

  useEffect(() => {
    if (!leadMatch) setPanelExpanded(false);
  }, [leadMatch]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [leadsData, tasksData, analyticsData, customersData, addonsData, customerAddonsData, scheduledData] = await Promise.all([
        api.getLeads(),
        api.getTasks(),
        api.getAnalytics(),
        api.getCustomers(),
        api.getAddons(),
        api.getCustomerAddons(),
        api.getScheduledEmails(),
      ]);
      setLeads(leadsData);
      setTasks(tasksData);
      setAnalytics(analyticsData);
      setCustomers(customersData);
      setAddons(addonsData);
      setCustomerAddons(customerAddonsData);
      setScheduledEmails(scheduledData);
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

  const handleToggleFavourite = useCallback(async (leadId) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;
    const newValue = !lead.isFavourite;
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, isFavourite: newValue } : l));
    try {
      await api.updateLead(leadId, { isFavourite: newValue });
    } catch (err) {
      console.error(err);
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, isFavourite: !newValue } : l));
    }
  }, [leads]);

  const handleLeadUpdate = useCallback((updatedLead) => {
    setLeads(prev => prev.map(l => l.id === updatedLead.id ? updatedLead : l));
  }, []);

  const handleLeadDelete = useCallback((leadId) => {
    setLeads(prev => prev.filter(l => l.id !== leadId));
    navigate('/leads');
    loadData();
  }, [loadData, navigate]);

  const selectLead = (lead, from) => navigate(`/leads/${lead.id}`, { state: { from } });

  if (user === undefined) return (
    <div className="flex items-center justify-center h-screen bg-slate-50">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!user) return <LoginScreen />;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar
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

      <main className={`flex-1 overflow-y-auto scrollbar-thin transition-all duration-200 ${selectedLead && !panelExpanded ? 'pr-[32rem]' : ''}`}>
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
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={
              <Dashboard
                leads={leads}
                tasks={tasks}
                analytics={analytics}
                customers={customers}
                addons={addons}
                customerAddons={customerAddons}
                onSelectLead={(lead) => selectLead(lead, 'dashboard')}
                setView={(id) => navigate(`/${id}`)}
              />
            } />
            <Route path="/leads" element={
              <LeadsView
                leads={leads}
                scheduledEmails={scheduledEmails}
                onSelectLead={(lead) => selectLead(lead, 'leads')}
                onRefresh={loadData}
                onToggleFavourite={handleToggleFavourite}
              />
            } />
            <Route path="/leads/:leadId" element={
              <LeadsView
                leads={leads}
                scheduledEmails={scheduledEmails}
                onSelectLead={(lead) => selectLead(lead, 'leads')}
                onRefresh={loadData}
                onToggleFavourite={handleToggleFavourite}
              />
            } />
            <Route path="/tasks" element={
              <TasksView
                tasks={tasks}
                leads={leads}
                onTaskUpdate={loadData}
                onSelectLead={(lead) => selectLead(lead, 'tasks')}
              />
            } />
            <Route path="/outreach" element={
              <OutreachView
                leads={leads}
                onSelectLead={(lead) => selectLead(lead, 'outreach')}
                onRefresh={loadData}
              />
            } />
            <Route path="/lead-gen" element={<LeadGenView />} />
            <Route path="/contracts" element={<ContractsView />} />
            <Route path="/customers" element={<CustomersView />} />
            <Route path="/addons" element={<AddonsView />} />
            <Route path="/documents" element={<DocumentsView />} />
          </Routes>
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
          onClose={() => navigate('/leads')}
          onUpdate={handleLeadUpdate}
          onDelete={handleLeadDelete}
          onTasksChange={loadData}
          onToggleFavourite={handleToggleFavourite}
          expanded={panelExpanded}
          onToggleExpand={() => setPanelExpanded(v => !v)}
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
