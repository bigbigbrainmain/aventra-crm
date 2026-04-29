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

  // Live Customers
  getCustomers:    ()           => req('/customers'),
  createCustomer:  (data)       => req('/customers',          { method: 'POST',   body: JSON.stringify(data) }),
  updateCustomer:  (id, data)   => req(`/customer?id=${id}`,  { method: 'PATCH',  body: JSON.stringify(data) }),
  deleteCustomer:  (id)         => req(`/customer?id=${id}`,  { method: 'DELETE' }),

  // Documents
  getDocuments:    ()           => req('/documents'),
  createDocument:  (data)       => req('/documents',          { method: 'POST',   body: JSON.stringify(data) }),
  updateDocument:  (id, data)   => req(`/document?id=${id}`,  { method: 'PATCH',  body: JSON.stringify(data) }),
  deleteDocument:  (id)         => req(`/document?id=${id}`,  { method: 'DELETE' }),

  // Add-ons catalog
  getAddons:           ()           => req('/addons'),
  createAddon:         (data)       => req('/addons',                   { method: 'POST',   body: JSON.stringify(data) }),
  updateAddon:         (id, data)   => req(`/addon?id=${id}`,           { method: 'PATCH',  body: JSON.stringify(data) }),
  deleteAddon:         (id)         => req(`/addon?id=${id}`,           { method: 'DELETE' }),

  // Customer add-ons
  getCustomerAddons:   (customerId) => req(customerId ? `/customer-addons?customerId=${customerId}` : '/customer-addons'),
  createCustomerAddon: (data)       => req('/customer-addons',          { method: 'POST',   body: JSON.stringify(data) }),
  updateCustomerAddon: (id, data)   => req(`/customer-addon?id=${id}`,  { method: 'PATCH',  body: JSON.stringify(data) }),
  deleteCustomerAddon: (id)         => req(`/customer-addon?id=${id}`,  { method: 'DELETE' }),

  // Setup
  setup:        ()          => req('/setup', { method: 'POST' }),

  // Email usage
  getEmailUsage: ()         => req('/email-usage'),
};
