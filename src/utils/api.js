const BASE = '/.netlify/functions';

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Leads
  getLeads:    ()           => req('/leads'),
  createLead:  (data)       => req('/leads',        { method: 'POST',   body: JSON.stringify(data) }),
  getLead:     (id)         => req(`/lead?id=${id}`),
  updateLead:  (id, data)   => req(`/lead?id=${id}`, { method: 'PATCH',  body: JSON.stringify(data) }),
  deleteLead:  (id)         => req(`/lead?id=${id}`, { method: 'DELETE' }),

  // Notes
  getNotes:    (leadId)     => req(`/notes?leadId=${leadId}`),
  addNote:     (leadId, text) => req('/notes',       { method: 'POST',   body: JSON.stringify({ leadId, text }) }),
  toggleNote:  (id)         => req(`/note?id=${id}`, { method: 'PATCH' }),
  deleteNote:  (id)         => req(`/note?id=${id}`, { method: 'DELETE' }),

  // Tasks
  getTasks:    (leadId)     => req(leadId ? `/tasks?leadId=${leadId}` : '/tasks'),
  addTask:     (leadId, description, dueDate) =>
    req('/tasks', { method: 'POST', body: JSON.stringify({ leadId, description, dueDate }) }),
  updateTask:  (id, data)   => req(`/task?id=${id}`, { method: 'PATCH',  body: JSON.stringify(data) }),
  deleteTask:  (id)         => req(`/task?id=${id}`, { method: 'DELETE' }),

  // Analytics
  getAnalytics: ()          => req('/analytics'),

  // Setup
  setup:        ()          => req('/setup', { method: 'POST' }),
};
