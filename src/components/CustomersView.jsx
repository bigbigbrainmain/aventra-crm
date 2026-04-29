import { useState, useEffect } from 'react';
import { ExternalLink, Github, PlusCircle, Pencil, Trash2, X, Package, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../utils/api';
import { formatDate } from '../utils/constants';

const CUSTOMER_STATUSES = ['Active', 'Paused', 'Churned'];

const STATUS_STYLE = {
  Active:  { bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500'  },
  Paused:  { bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-500'  },
  Churned: { bg: 'bg-red-100',    text: 'text-red-600',    dot: 'bg-red-400'    },
};

const EMPTY_FORM = {
  businessName: '', domain: '', netlifyUrl: '', githubFolder: '',
  goLiveDate: '', monthlyFee: '', setupFee: '', status: 'Active', notes: '',
};

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || { bg: 'bg-slate-100', text: 'text-slate-500', dot: 'bg-slate-300' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}

function CustomerModal({ customer, onClose, onSave }) {
  const [form, setForm] = useState(customer ? { ...customer } : { ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.businessName.trim()) return;
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">{customer ? 'Edit Customer' : 'Add Live Customer'}</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Business Name *</label>
              <input
                value={form.businessName}
                onChange={e => set('businessName', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Hull & Humber Driver Training"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Domain</label>
              <input
                value={form.domain}
                onChange={e => set('domain', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="www.theirdomain.com"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Monthly Fee (£)</label>
              <input
                value={form.monthlyFee}
                onChange={e => set('monthlyFee', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="150"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Setup Fee (£)</label>
              <input
                value={form.setupFee}
                onChange={e => set('setupFee', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Netlify URL</label>
              <input
                value={form.netlifyUrl}
                onChange={e => set('netlifyUrl', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://clientname-753.netlify.app"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">GitHub Folder</label>
              <input
                value={form.githubFolder}
                onChange={e => set('githubFolder', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="hullandhumber"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Go Live Date</label>
              <input
                type="date"
                value={form.goLiveDate}
                onChange={e => set('goLiveDate', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
              <select
                value={form.status}
                onChange={e => set('status', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {CUSTOMER_STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Any notes about this customer..."
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.businessName.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? 'Saving...' : customer ? 'Save Changes' : 'Add Customer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Resolves the effective monthly/one-off fee for a customer-addon link
function effectiveFees(customerAddon, addonsMap) {
  const catalog = addonsMap[customerAddon.addonId] || {};
  const monthly = customerAddon.customMonthlyFee !== ''
    ? parseFloat(customerAddon.customMonthlyFee) || 0
    : parseFloat(catalog.monthlyFee) || 0;
  const oneOff = customerAddon.customOneOffFee !== ''
    ? parseFloat(customerAddon.customOneOffFee) || 0
    : parseFloat(catalog.oneOffFee) || 0;
  return { monthly, oneOff };
}

function CustomerAddonsModal({ customer, addons, customerAddons, onClose, onRefresh }) {
  const addonsMap = Object.fromEntries(addons.map(a => [a.id, a]));
  const linked = customerAddons.filter(ca => ca.customerId === customer.id);

  const [showLinkForm, setShowLinkForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [linkForm, setLinkForm] = useState({ addonId: '', customMonthlyFee: '', customOneOffFee: '', startDate: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const availableAddons = addons.filter(a => a.active);

  const resetForm = () => {
    setLinkForm({ addonId: '', customMonthlyFee: '', customOneOffFee: '', startDate: '', notes: '' });
    setShowLinkForm(false);
    setEditingId(null);
  };

  const handleLink = async () => {
    if (!linkForm.addonId) return;
    setSaving(true);
    try {
      await api.createCustomerAddon({ ...linkForm, customerId: customer.id });
      await onRefresh();
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (caId) => {
    setSaving(true);
    try {
      await api.updateCustomerAddon(caId, linkForm);
      await onRefresh();
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (ca) => {
    const name = addonsMap[ca.addonId]?.name || 'this add-on';
    if (!confirm(`Remove ${name} from ${customer.businessName}?`)) return;
    await api.deleteCustomerAddon(ca.id);
    await onRefresh();
  };

  const startEdit = (ca) => {
    setEditingId(ca.id);
    setLinkForm({
      addonId: ca.addonId,
      customMonthlyFee: ca.customMonthlyFee,
      customOneOffFee: ca.customOneOffFee,
      startDate: ca.startDate,
      notes: ca.notes,
    });
    setShowLinkForm(false);
  };

  const totalAddonMrr = linked.reduce((sum, ca) => sum + effectiveFees(ca, addonsMap).monthly, 0);
  const baseFee = parseFloat(customer.monthlyFee) || 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h3 className="font-semibold text-slate-900">Add-ons — {customer.businessName}</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Base: £{baseFee.toLocaleString()}/mo
              {totalAddonMrr > 0 && (
                <>
                  <span className="mx-1.5 text-slate-300">+</span>
                  <span className="text-blue-600 font-medium">£{totalAddonMrr.toLocaleString()}/mo add-ons</span>
                  <span className="mx-1.5 text-slate-300">=</span>
                  <span className="text-green-600 font-semibold">£{(baseFee + totalAddonMrr).toLocaleString()}/mo total</span>
                </>
              )}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Linked add-ons list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {linked.length === 0 && !showLinkForm && (
            <div className="text-center py-8">
              <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center mx-auto mb-2">
                <Package size={18} className="text-slate-300" />
              </div>
              <p className="text-slate-400 text-sm">No add-ons linked yet</p>
            </div>
          )}

          {linked.map(ca => {
            const catalog = addonsMap[ca.addonId];
            if (!catalog) return null;
            const fees = effectiveFees(ca, addonsMap);
            const isEditing = editingId === ca.id;

            return (
              <div key={ca.id} className="border border-slate-100 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-slate-50">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                      <Package size={13} className="text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{catalog.name}</p>
                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                        {fees.monthly > 0 && (
                          <span className="text-green-600 font-medium">
                            £{fees.monthly.toLocaleString()}/mo
                            {ca.customMonthlyFee !== '' && ca.customMonthlyFee !== catalog.monthlyFee && (
                              <span className="ml-1 text-slate-400 font-normal">(custom)</span>
                            )}
                          </span>
                        )}
                        {fees.oneOff > 0 && (
                          <span>£{fees.oneOff.toLocaleString()} one-off</span>
                        )}
                        {ca.startDate && <span>since {formatDate(ca.startDate)}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => isEditing ? resetForm() : startEdit(ca)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title={isEditing ? 'Cancel edit' : 'Edit'}
                    >
                      {isEditing ? <ChevronUp size={13} /> : <Pencil size={13} />}
                    </button>
                    <button
                      onClick={() => handleRemove(ca)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Remove"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Inline edit form */}
                {isEditing && (
                  <div className="px-4 py-3 border-t border-slate-100 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          Custom Monthly Fee (£)
                          {catalog.monthlyFee && (
                            <span className="ml-1 font-normal text-slate-400">default: £{catalog.monthlyFee}</span>
                          )}
                        </label>
                        <input
                          value={linkForm.customMonthlyFee}
                          onChange={e => setLinkForm(f => ({ ...f, customMonthlyFee: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder={catalog.monthlyFee || '0'}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          Custom One-off Fee (£)
                          {catalog.oneOffFee && (
                            <span className="ml-1 font-normal text-slate-400">default: £{catalog.oneOffFee}</span>
                          )}
                        </label>
                        <input
                          value={linkForm.customOneOffFee}
                          onChange={e => setLinkForm(f => ({ ...f, customOneOffFee: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder={catalog.oneOffFee || '0'}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Start Date</label>
                        <input
                          type="date"
                          value={linkForm.startDate}
                          onChange={e => setLinkForm(f => ({ ...f, startDate: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
                        <input
                          value={linkForm.notes}
                          onChange={e => setLinkForm(f => ({ ...f, notes: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Optional note..."
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button onClick={resetForm} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors">
                        Cancel
                      </button>
                      <button
                        onClick={() => handleUpdate(ca.id)}
                        disabled={saving}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Link new add-on form */}
          {showLinkForm && (
            <div className="border border-blue-100 bg-blue-50/50 rounded-xl px-4 py-3 space-y-3">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Link Add-on</p>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Add-on *</label>
                <select
                  value={linkForm.addonId}
                  onChange={e => setLinkForm(f => ({ ...f, addonId: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">Select an add-on...</option>
                  {availableAddons
                    .filter(a => !linked.some(ca => ca.addonId === a.id))
                    .map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                        {a.monthlyFee ? ` — £${a.monthlyFee}/mo` : ''}
                        {a.oneOffFee ? ` + £${a.oneOffFee} setup` : ''}
                      </option>
                    ))
                  }
                </select>
              </div>
              {linkForm.addonId && (() => {
                const catalog = addonsMap[linkForm.addonId] || {};
                return (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        Custom Monthly Fee (£)
                        {catalog.monthlyFee && (
                          <span className="ml-1 font-normal text-slate-400">default: £{catalog.monthlyFee}</span>
                        )}
                      </label>
                      <input
                        value={linkForm.customMonthlyFee}
                        onChange={e => setLinkForm(f => ({ ...f, customMonthlyFee: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        placeholder={catalog.monthlyFee || '0 (use default)'}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        Custom One-off Fee (£)
                        {catalog.oneOffFee && (
                          <span className="ml-1 font-normal text-slate-400">default: £{catalog.oneOffFee}</span>
                        )}
                      </label>
                      <input
                        value={linkForm.customOneOffFee}
                        onChange={e => setLinkForm(f => ({ ...f, customOneOffFee: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        placeholder={catalog.oneOffFee || '0 (use default)'}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Start Date</label>
                      <input
                        type="date"
                        value={linkForm.startDate}
                        onChange={e => setLinkForm(f => ({ ...f, startDate: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
                      <input
                        value={linkForm.notes}
                        onChange={e => setLinkForm(f => ({ ...f, notes: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        placeholder="Optional note..."
                      />
                    </div>
                  </div>
                );
              })()}
              <div className="flex justify-end gap-2">
                <button onClick={resetForm} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleLink}
                  disabled={saving || !linkForm.addonId}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
                >
                  {saving ? 'Linking...' : 'Link Add-on'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 shrink-0">
          {!showLinkForm && !editingId && (
            <button
              onClick={() => { setShowLinkForm(true); setEditingId(null); }}
              disabled={availableAddons.filter(a => !linked.some(ca => ca.addonId === a.id)).length === 0}
              className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium disabled:text-slate-300 disabled:cursor-not-allowed transition-colors"
            >
              <PlusCircle size={14} />
              {availableAddons.filter(a => !linked.some(ca => ca.addonId === a.id)).length === 0
                ? 'All add-ons already linked'
                : 'Link an add-on'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CustomersView() {
  const [customers, setCustomers] = useState([]);
  const [addons, setAddons] = useState([]);
  const [customerAddons, setCustomerAddons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'add' | customer object
  const [addonsModal, setAddonsModal] = useState(null); // null | customer object

  const load = async () => {
    setLoading(true);
    try {
      const [customersData, addonsData, caData] = await Promise.all([
        api.getCustomers(),
        api.getAddons(),
        api.getCustomerAddons(),
      ]);
      setCustomers(customersData);
      setAddons(addonsData);
      setCustomerAddons(caData);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (form) => {
    if (modal === 'add') {
      await api.createCustomer(form);
    } else {
      await api.updateCustomer(modal.id, form);
    }
    await load();
  };

  const handleDelete = async (customer) => {
    if (!confirm(`Remove ${customer.businessName} from Live Customers?`)) return;
    await api.deleteCustomer(customer.id);
    await load();
  };

  const githubUrl = (folder) =>
    folder ? `https://github.com/bigbigbrainmain/aventra-sites/tree/main/${folder}` : null;

  const addonsMap = Object.fromEntries(addons.map(a => [a.id, a]));

  // Per-customer add-on MRR
  const customerAddonMrr = (customerId) =>
    customerAddons
      .filter(ca => ca.customerId === customerId)
      .reduce((sum, ca) => {
        const catalog = addonsMap[ca.addonId] || {};
        const monthly = ca.customMonthlyFee !== ''
          ? parseFloat(ca.customMonthlyFee) || 0
          : parseFloat(catalog.monthlyFee) || 0;
        return sum + monthly;
      }, 0);

  const activeCustomers = customers.filter(c => c.status === 'Active');

  const baseMrr = activeCustomers.reduce((sum, c) => sum + (parseFloat(c.monthlyFee) || 0), 0);
  const addonMrr = activeCustomers.reduce((sum, c) => sum + customerAddonMrr(c.id), 0);
  const totalMrr = baseMrr + addonMrr;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Live Customers</h2>
          <p className="text-slate-500 text-sm mt-0.5">
            {activeCustomers.length} active
            {totalMrr > 0 && (
              <span className="ml-2 text-green-600 font-medium">
                · £{totalMrr.toLocaleString()}/mo MRR
                {addonMrr > 0 && (
                  <span className="text-slate-400 font-normal ml-1">
                    (£{baseMrr.toLocaleString()} base + £{addonMrr.toLocaleString()} add-ons)
                  </span>
                )}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => setModal('add')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors"
        >
          <PlusCircle size={15} />
          Add Customer
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : customers.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-2xl border border-slate-100">
          <p className="text-slate-400 text-sm mb-3">No live customers yet</p>
          <button
            onClick={() => setModal('add')}
            className="text-blue-600 hover:text-blue-700 text-sm font-medium transition-colors"
          >
            Add your first customer →
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Business</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Domain</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Setup</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Monthly</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Add-ons</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Go Live</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Links</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {customers.map(c => {
                const linkedAddons = customerAddons.filter(ca => ca.customerId === c.id);
                const extraMrr = customerAddonMrr(c.id);
                return (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-900">{c.businessName}</p>
                      {c.notes && <p className="text-xs text-slate-400 truncate max-w-[200px] mt-0.5">{c.notes}</p>}
                    </td>
                    <td className="px-5 py-3.5">
                      {c.domain ? (
                        <a href={`https://${c.domain.replace(/^https?:\/\//, '')}`} target="_blank" rel="noreferrer"
                          className="text-blue-600 hover:text-blue-700 hover:underline transition-colors"
                          onClick={e => e.stopPropagation()}>
                          {c.domain.replace(/^https?:\/\//, '')}
                        </a>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      {c.setupFee
                        ? <span className="text-slate-600">£{c.setupFee}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      {c.monthlyFee
                        ? <span className="font-medium text-slate-800">£{c.monthlyFee}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => setAddonsModal(c)}
                        className="flex items-center gap-1.5 group/btn"
                        title="Manage add-ons"
                      >
                        {linkedAddons.length > 0 ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600 group-hover/btn:bg-blue-100 transition-colors">
                            <Package size={11} />
                            {linkedAddons.length}
                            {extraMrr > 0 && <span className="text-blue-400">+£{extraMrr}/mo</span>}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs group-hover/btn:text-blue-400 transition-colors">
                            + add-on
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500">
                      {c.goLiveDate ? formatDate(c.goLiveDate) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        {githubUrl(c.githubFolder) && (
                          <a href={githubUrl(c.githubFolder)} target="_blank" rel="noreferrer"
                            title="View on GitHub"
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                            onClick={e => e.stopPropagation()}>
                            <Github size={14} />
                          </a>
                        )}
                        {c.netlifyUrl && (
                          <a href={c.netlifyUrl} target="_blank" rel="noreferrer"
                            title="Open Netlify site"
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                            onClick={e => e.stopPropagation()}>
                            <ExternalLink size={14} />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setModal(c)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(c)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <CustomerModal
          customer={modal === 'add' ? null : modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}

      {addonsModal && (
        <CustomerAddonsModal
          customer={addonsModal}
          addons={addons}
          customerAddons={customerAddons}
          onClose={() => setAddonsModal(null)}
          onRefresh={async () => {
            const [addonsData, caData] = await Promise.all([
              api.getAddons(),
              api.getCustomerAddons(),
            ]);
            setAddons(addonsData);
            setCustomerAddons(caData);
          }}
        />
      )}
    </div>
  );
}
