import { useState, useEffect } from 'react';
import { PlusCircle, Pencil, Trash2, X, Package, Users } from 'lucide-react';
import { api } from '../utils/api';

const EMPTY_FORM = {
  name: '', description: '', oneOffFee: '', monthlyFee: '', active: true,
};

function AddonModal({ addon, onClose, onSave }) {
  const [form, setForm] = useState(addon ? { ...addon } : { ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) return;
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
          <h3 className="font-semibold text-slate-900">{addon ? 'Edit Add-on' : 'New Add-on'}</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Name *</label>
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. SEO Package, Google Ads Management"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Brief description of what this add-on includes..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">One-off Fee (£)</label>
              <input
                value={form.oneOffFee}
                onChange={e => set('oneOffFee', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Monthly Fee (£)</label>
              <input
                value={form.monthlyFee}
                onChange={e => set('monthlyFee', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="addonActive"
              checked={form.active}
              onChange={e => set('active', e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded border-slate-300"
            />
            <label htmlFor="addonActive" className="text-sm text-slate-700">Active (available to link to customers)</label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.name.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? 'Saving...' : addon ? 'Save Changes' : 'Create Add-on'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AddonsView() {
  const [addons, setAddons] = useState([]);
  const [customerAddons, setCustomerAddons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'add' | addon object

  const load = async () => {
    setLoading(true);
    try {
      const [addonsData, caData] = await Promise.all([
        api.getAddons(),
        api.getCustomerAddons(),
      ]);
      setAddons(addonsData);
      setCustomerAddons(caData);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (form) => {
    if (modal === 'add') {
      await api.createAddon(form);
    } else {
      await api.updateAddon(modal.id, form);
    }
    await load();
  };

  const handleDelete = async (addon) => {
    const usageCount = customerAddons.filter(ca => ca.addonId === addon.id).length;
    const warning = usageCount > 0
      ? `\n\nWarning: this add-on is linked to ${usageCount} customer(s). Those links will be orphaned.`
      : '';
    if (!confirm(`Delete "${addon.name}"?${warning}`)) return;
    await api.deleteAddon(addon.id);
    await load();
  };

  const customerCount = (addonId) =>
    customerAddons.filter(ca => ca.addonId === addonId).length;

  const totalMonthlyMrr = addons
    .filter(a => a.active && a.monthlyFee)
    .reduce((sum, a) => {
      const count = customerCount(a.id);
      return sum + count * (parseFloat(a.monthlyFee) || 0);
    }, 0);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Add-ons</h2>
          <p className="text-slate-500 text-sm mt-0.5">
            {addons.filter(a => a.active).length} active add-ons
            {totalMonthlyMrr > 0 && (
              <span className="ml-2 text-green-600 font-medium">
                · £{totalMonthlyMrr.toLocaleString()}/mo from add-ons
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => setModal('add')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors"
        >
          <PlusCircle size={15} />
          New Add-on
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : addons.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-2xl border border-slate-100">
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Package size={22} className="text-blue-400" />
          </div>
          <p className="text-slate-700 font-medium mb-1">No add-ons yet</p>
          <p className="text-slate-400 text-sm mb-4">Create add-on services to link to your customers</p>
          <button
            onClick={() => setModal('add')}
            className="text-blue-600 hover:text-blue-700 text-sm font-medium transition-colors"
          >
            Create your first add-on →
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Add-on</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">One-off Fee</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Monthly Fee</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Customers</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {addons.map(a => {
                const count = customerCount(a.id);
                return (
                  <tr key={a.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-900">{a.name}</p>
                      {a.description && (
                        <p className="text-xs text-slate-400 mt-0.5 max-w-xs truncate">{a.description}</p>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {a.oneOffFee
                        ? <span className="font-medium text-slate-800">£{a.oneOffFee}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      {a.monthlyFee
                        ? <span className="font-medium text-slate-800">£{a.monthlyFee}/mo</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      {count > 0 ? (
                        <span className="inline-flex items-center gap-1.5 text-slate-600">
                          <Users size={12} className="text-slate-400" />
                          {count}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {a.active ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setModal(a)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(a)}
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
        <AddonModal
          addon={modal === 'add' ? null : modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
