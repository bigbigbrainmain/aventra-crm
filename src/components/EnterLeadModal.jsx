import { useState } from 'react';
import { X } from 'lucide-react';
import { STATUSES } from '../utils/constants';

const PRIORITIES = ['🔴 Priority 1', '🟠 Priority 2', '🟡 Priority 3'];

const EMPTY = {
  businessName: '',
  phone: '',
  priority: '',
  city: '',
  industry: '',
  status: 'New',
  email: '',
  website: '',
  priorityReason: '',
  datePitched: '',
  notes: '',
  subject: '',
  emailBody: '',
  calendlyLinkSent: 'No',
};

export default function EnterLeadModal({ onClose, onSave }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const set = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
    if (errors[field]) setErrors(e => ({ ...e, [field]: false }));
  };

  const validate = () => {
    const e = {};
    if (!form.businessName.trim()) e.businessName = true;
    if (!form.phone.trim()) e.phone = true;
    if (!form.priority) e.priority = true;
    if (!form.city.trim()) e.city = true;
    if (!form.industry.trim()) e.industry = true;
    if (!form.status) e.status = true;
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      alert('Failed to save lead: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const field = (label, key, type = 'text', required = false) => (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={form[key]}
        onChange={e => set(key, e.target.value)}
        className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
          ${errors[key] ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white'}`}
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Enter Lead</h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {/* Mandatory fields */}
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Required</p>

          {field('Company Name', 'businessName', 'text', true)}

          {field('Phone Number', 'phone', 'tel', true)}

          <div className="grid grid-cols-2 gap-3">
            {/* Priority */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Priority<span className="text-red-500 ml-0.5">*</span>
              </label>
              <select
                value={form.priority}
                onChange={e => set('priority', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white
                  ${errors.priority ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
              >
                <option value="">Select...</option>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Status<span className="text-red-500 ml-0.5">*</span>
              </label>
              <select
                value={form.status}
                onChange={e => set('status', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white
                  ${errors.status ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
              >
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {field('Location', 'city', 'text', true)}
            {field('Industry', 'industry', 'text', true)}
          </div>

          {/* Optional fields */}
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider pt-2">Optional</p>

          <div className="grid grid-cols-2 gap-3">
            {field('Email', 'email', 'email')}
            {field('Website', 'website', 'url')}
          </div>

          {field('Priority Reason', 'priorityReason')}
          {field('Date Pitched', 'datePitched', 'date')}

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {field('Email Subject', 'subject')}

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Email Body</label>
            <textarea
              value={form.emailBody}
              onChange={e => set('emailBody', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Calendly Link Sent</label>
            <select
              value={form.calendlyLinkSent}
              onChange={e => set('calendlyLinkSent', e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            >
              <option value="No">No</option>
              <option value="Yes">Yes</option>
            </select>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Lead'}
          </button>
        </div>
      </div>
    </div>
  );
}
