import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useUserSettings } from '../hooks/useUserSettings';
import { useAuth } from '../contexts/AuthContext';

export default function SignatureModal({ onClose }) {
  const { user } = useAuth();
  const { getSignature, saveSignature } = useUserSettings();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSignature().then(sig => { setText(sig); setLoading(false); });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await saveSignature(text.trimEnd());
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed bottom-20 left-[260px] z-50 w-72">
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Email Signature</h3>
            {user && <p className="text-xs text-slate-500 mt-0.5">{user.email}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={14} />
          </button>
        </div>
        <p className="text-xs text-slate-400">Appended to every AI-generated email draft.</p>
        {loading ? (
          <div className="h-24 bg-slate-700 rounded-lg animate-pulse" />
        ) : (
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={5}
            placeholder={'Joe\nAventra\n+44 7700 900000\naventrasites.online'}
            className="w-full bg-slate-700 text-slate-100 text-xs rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-500 font-mono"
          />
        )}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
