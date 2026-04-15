import { useState, useEffect } from 'react';
import { ExternalLink, Github, PlusCircle, Pencil, Trash2, X } from 'lucide-react';
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
  goLiveDate: '', monthlyFee: '', status: 'Active', notes: '',
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

export default function CustomersView() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'add' | customer object

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getCustomers();
      setCustomers(data);
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

  const totalMrr = customers
    .filter(c => c.status === 'Active')
    .reduce((sum, c) => sum + (parseFloat(c.monthlyFee) || 0), 0);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Live Customers</h2>
          <p className="text-slate-500 text-sm mt-0.5">
            {customers.filter(c => c.status === 'Active').length} active
            {totalMrr > 0 && <span className="ml-2 text-green-600 font-medium">· £{totalMrr.toLocaleString()}/mo MRR</span>}
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
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Monthly Fee</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Go Live</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Links</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {customers.map(c => (
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
                    {c.monthlyFee
                      ? <span className="font-medium text-slate-800">£{c.monthlyFee}</span>
                      : <span className="text-slate-300">—</span>}
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
              ))}
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
    </div>
  );
}
