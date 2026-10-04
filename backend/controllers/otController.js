const crypto = require('crypto');
const axios = require('axios');
const { pool } = require('../config/db');

/* ------------------------------------------------------------------ */
/* Telegram helpers (also used by botController)                       */
/* ------------------------------------------------------------------ */

function tgApi(method, payload) {
  return axios.post(
    `https://api.telegram.org/bot${process.env.BOT_TOKEN}/${method}`,
    payload,
    { timeout: 10000 }
  );
}

function tgErrorMessage(err) {
  return err.response?.data?.description || err.message || 'Unknown Telegram error';
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Message sent to the employee (DM). `rec` needs name, department, ot_date, start_time, end_time, note. */
function buildDmText(rec) {
  return [
    '🕒 <b>New Overtime Assignment</b>',
    '',
    `👤 <b>Employee:</b> ${escapeHtml(rec.name)}`,
    rec.department ? `🏢 <b>Department:</b> ${escapeHtml(rec.department)}` : null,
    `📅 <b>Date:</b> ${escapeHtml(rec.ot_date)}`,
    `⏰ <b>Time:</b> ${escapeHtml(rec.start_time)} – ${escapeHtml(rec.end_time)}`,
    rec.note ? `📝 <b>Note:</b> ${escapeHtml(rec.note)}` : null,
    '',
    'Please tap <b>Acknowledge</b> to confirm you have received this assignment.',
  ]
    .filter((line) => line !== null)
    .join('\n');
}

/** Public announcement for the group. */
function buildGroupText(rec) {
  return [
    '📢 <b>OT Assigned</b>',
    '',
    `👤 ${escapeHtml(rec.name)}${rec.department ? ` (${escapeHtml(rec.department)})` : ''}`,
    `📅 ${escapeHtml(rec.ot_date)}`,
    `⏰ ${escapeHtml(rec.start_time)} – ${escapeHtml(rec.end_time)}`,
    rec.note ? `📝 ${escapeHtml(rec.note)}` : null,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

/* ------------------------------------------------------------------ */
/* Security: validate Telegram Mini App initData                       */
/* ------------------------------------------------------------------ */

/**
 * Validates the signed initData string from window.Telegram.WebApp.initData.
 * Returns the Telegram user object, or null when invalid/expired.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
function verifyInitData(initData, botToken, maxAgeSeconds = 24 * 60 * 60) {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  if (!receivedHash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  const a = Buffer.from(calculatedHash, 'utf8');
  const b = Buffer.from(receivedHash, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSeconds) return null;

  try {
    return JSON.parse(params.get('user'));
  } catch {
    return null;
  }
}

/** Express middleware: only the Boss (BOSS_ID) may pass. */
function requireBoss(req, res, next) {
  const bossId = String(process.env.BOSS_ID || '');
  if (!bossId) {
    return res.status(500).json({ success: false, message: 'Server misconfigured: BOSS_ID missing' });
  }

  const user = verifyInitData(req.get('x-telegram-init-data'), process.env.BOT_TOKEN);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid or expired Telegram session' });
  }

  if (String(user.id) !== bossId) {
    return res.status(403).json({ success: false, message: 'Only the boss can perform this action' });
  }

  // Explicit boss_id check on writes
  if (req.method === 'POST' && String(req.body?.boss_id) !== bossId) {
    return res.status(403).json({ success: false, message: 'boss_id does not match' });
  }

  req.boss = user;
  next();
}

/* ------------------------------------------------------------------ */
/* Controllers                                                         */
/* ------------------------------------------------------------------ */

/** GET /api/employees */
async function getEmployees(req, res) {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, department FROM employees ORDER BY name ASC'
    );
    res.json({ success: true, employees: rows });
  } catch (err) {
    console.error('getEmployees error:', err);
    res.status(500).json({ success: false, message: 'Failed to load employees' });
  }
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** POST /api/assign-ot */
async function assignOt(req, res) {
  const { employee_id, ot_date, start_time, end_time } = req.body || {};
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';

  // ---- Validation ----
  const employeeId = Number(employee_id);
  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    return res.status(400).json({ success: false, message: 'Please select an employee' });
  }
  if (!isValidDate(ot_date)) {
    return res.status(400).json({ success: false, message: 'Invalid date (use YYYY-MM-DD)' });
  }
  if (!TIME_RE.test(start_time || '') || !TIME_RE.test(end_time || '')) {
    return res.status(400).json({ success: false, message: 'Invalid start or end time (use HH:MM)' });
  }
  if (end_time <= start_time) {
    return res.status(400).json({ success: false, message: 'End time must be after start time' });
  }
  if (note.length > 500) {
    return res.status(400).json({ success: false, message: 'Note must be 500 characters or fewer' });
  }

  try {
    // ---- Employee lookup ----
    const empResult = await pool.query(
      'SELECT id, name, department, telegram_chat_id FROM employees WHERE id = $1',
      [employeeId]
    );
    if (empResult.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }
    const employee = empResult.rows[0];

    // ---- Insert OT record ----
    const insertResult = await pool.query(
      `INSERT INTO overtime_records (employee_id, ot_date, start_time, end_time, note, status)
       VALUES ($1, $2, $3, $4, $5, 'assigned')
       RETURNING id, employee_id, ot_date::text AS ot_date,
                 to_char(start_time, 'HH24:MI') AS start_time,
                 to_char(end_time, 'HH24:MI') AS end_time,
                 note, status`,
      [employeeId, ot_date, start_time, end_time, note || null]
    );
    const record = insertResult.rows[0];

    const messageData = {
      name: employee.name,
      department: employee.department,
      ot_date: record.ot_date,
      start_time: record.start_time,
      end_time: record.end_time,
      note: record.note,
    };

    // ---- Notify employee (DM) and group, independently ----
    const [dmResult, groupResult] = await Promise.allSettled([
      tgApi('sendMessage', {
        chat_id: employee.telegram_chat_id,
        text: buildDmText(messageData),
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '✅ Acknowledge', callback_data: `ack:${record.id}` }]],
        },
      }),
      tgApi('sendMessage', {
        chat_id: process.env.GROUP_CHAT_ID,
        text: buildGroupText(messageData),
        parse_mode: 'HTML',
      }),
    ]);

    const warnings = [];
    if (dmResult.status === 'rejected') {
      console.error('DM failed:', tgErrorMessage(dmResult.reason));
      warnings.push(
        `Could not message ${employee.name} directly (they may need to open the bot and send /start).`
      );
    }
    if (groupResult.status === 'rejected') {
      console.error('Group announcement failed:', tgErrorMessage(groupResult.reason));
      warnings.push('Could not post the announcement to the group.');
    }

    return res.status(201).json({ success: true, record, warnings });
  } catch (err) {
    console.error('assignOt error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = {
  assignOt,
  getEmployees,
  requireBoss,
  verifyInitData,
  tgApi,
  tgErrorMessage,
  escapeHtml,
  buildDmText,
  buildGroupText,
};