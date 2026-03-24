const { TABS, rowToLead, rowToTask, getRange } = require('./_sheets');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };

  try {
    const [leadRows, taskRows] = await Promise.all([
      getRange(TABS.LEADS, 'A2:O'),
      getRange(TABS.TASKS, 'A2:F'),
    ]);

    const leads = leadRows.map((row, i) => rowToLead(row, i + 2)).filter(l => l.id);
    const tasks = taskRows.map((row, i) => rowToTask(row, i + 2)).filter(t => t.id);

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const byStatus = {};
    leads.forEach(l => {
      const s = l.status || 'New';
      byStatus[s] = (byStatus[s] || 0) + 1;
    });

    const byPriority = {};
    leads.forEach(l => {
      const p = l.priority || '';
      if (p) byPriority[p] = (byPriority[p] || 0) + 1;
    });

    const todayTasksCount = tasks.filter(t => {
      if (t.completed || !t.dueDate) return false;
      const d = new Date(t.dueDate);
      return d >= today && d < tomorrow;
    }).length;

    const overdueTasksCount = tasks.filter(t => {
      if (t.completed || !t.dueDate) return false;
      return new Date(t.dueDate) < today;
    }).length;

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({
        totalLeads: leads.length,
        byStatus,
        byPriority,
        totalTasks: tasks.length,
        completedTasks: tasks.filter(t => t.completed).length,
        todayTasksCount,
        overdueTasksCount,
      }),
    };
  } catch (err) {
    console.error('analytics error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
