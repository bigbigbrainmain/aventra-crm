export const STATUSES = [
  'New',
  'Emailed',
  'Called',
  'Booked',
  'In Progress',
  'Live/Paid',
  'Not Interested',
];

export const STATUS_CONFIG = {
  'New':            { bg: 'bg-slate-100',  text: 'text-slate-600',  dot: 'bg-slate-400'  },
  'Emailed':        { bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500'   },
  'Called':         { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
  'Booked':         { bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-500'  },
  'In Progress':    { bg: 'bg-yellow-100', text: 'text-yellow-800', dot: 'bg-yellow-500' },
  'Live/Paid':      { bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500'  },
  'Not Interested': { bg: 'bg-red-100',    text: 'text-red-600',    dot: 'bg-red-400'    },
};

export const PRIORITY_CONFIG = {
  '🔴 Priority 1': { bg: 'bg-red-100',    text: 'text-red-700',    label: 'P1',   dot: 'bg-red-500'    },
  '🟠 Priority 2': { bg: 'bg-orange-100', text: 'text-orange-700', label: 'P2',   dot: 'bg-orange-500' },
  '🟡 Priority 3': { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'P3',   dot: 'bg-yellow-500' },
  '🟢 Skip':        { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Skip', dot: 'bg-green-500'  },
};

export function getStatusStyle(status) {
  return STATUS_CONFIG[status] || { bg: 'bg-slate-100', text: 'text-slate-500', dot: 'bg-slate-300' };
}

export function getPriorityStyle(priority) {
  return PRIORITY_CONFIG[priority] || null;
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const secs = Math.floor((Date.now() - d) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`;
  return formatDate(iso);
}

export function isDueToday(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const today = new Date();
  return d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
}

export function isOverdue(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}
