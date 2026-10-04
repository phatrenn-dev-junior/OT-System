const { pool } = require('../config/db');
const { tgApi, tgErrorMessage, buildDmText, escapeHtml } = require('./otController');

async function answerCallback(callbackQueryId, text, showAlert = false) {
  try {
    await tgApi('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert,
    });
  } catch (err) {
    console.error('answerCallbackQuery failed:', tgErrorMessage(err));
  }
}

/** Handles the "Acknowledge" button. */
async function handleCallbackQuery(cq) {
  const match = /^ack:(\d+)$/.exec(cq.data || '');
  if (!match) {
    return answerCallback(cq.id, 'Unknown action');
  }
  const recordId = Number(match[1]);

  const { rows } = await pool.query(
    `SELECT o.id, o.status,
            o.ot_date::text AS ot_date,
            to_char(o.start_time, 'HH24:MI') AS start_time,
            to_char(o.end_time, 'HH24:MI') AS end_time,
            o.note,
            e.name, e.department, e.telegram_chat_id
       FROM overtime_records o
       JOIN employees e ON e.id = o.employee_id
      WHERE o.id = $1`,
    [recordId]
  );

  if (rows.length === 0) {
    return answerCallback(cq.id, 'This OT record no longer exists', true);
  }
  const record = rows[0];

  // Only the assigned employee may acknowledge
  if (String(cq.from.id) !== String(record.telegram_chat_id)) {
    return answerCallback(cq.id, 'This assignment is not yours', true);
  }

  // Atomic update: only moves 'assigned' -> 'acknowledged'
  const update = await pool.query(
    `UPDATE overtime_records
        SET status = 'acknowledged', acknowledged_at = NOW()
      WHERE id = $1 AND status = 'assigned'`,
    [recordId]
  );
  const alreadyAcknowledged = update.rowCount === 0;

  // Edit the message: add a confirmation line and remove the button
  if (cq.message) {
    try {
      await tgApi('editMessageText', {
        chat_id: cq.message.chat.id,
        message_id: cq.message.message_id,
        text: `${buildDmText(record).replace(
          /\n\nPlease tap[\s\S]*$/,
          ''
        )}\n\n✅ <b>Acknowledged</b>`,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [] },
      });
    } catch (err) {
      console.error('editMessageText failed:', tgErrorMessage(err));
    }
  }

  return answerCallback(
    cq.id,
    alreadyAcknowledged ? 'Already acknowledged ✅' : 'Acknowledged ✅'
  );
}

/** Replies to /start so employees can learn their Telegram ID for registration. */
async function handleMessage(message) {
  if (message.chat?.type !== 'private') return;
  if (!(message.text || '').startsWith('/start')) return;

  const name = escapeHtml(message.from?.first_name || 'there');
  await tgApi('sendMessage', {
    chat_id: message.chat.id,
    parse_mode: 'HTML',
    text:
      `Hello ${name}! 👋\n\n` +
      `Your Telegram ID is <code>${message.from.id}</code>.\n` +
      `Give this ID to your manager so you can be registered and receive OT assignments here.`,
  });
}

/** POST /webhook */
async function handleWebhook(req, res) {
  // Verify the request really comes from Telegram
  const expectedSecret = process.env.WEBHOOK_SECRET;
  if (expectedSecret && req.get('x-telegram-bot-api-secret-token') !== expectedSecret) {
    return res.sendStatus(403);
  }

  const update = req.body || {};

  try {
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    } else if (update.message) {
      await handleMessage(update.message);
    }
  } catch (err) {
    // Always return 200 so Telegram does not keep retrying a failing update
    console.error('Webhook processing error:', err);
  }

  return res.sendStatus(200);
}

module.exports = { handleWebhook };