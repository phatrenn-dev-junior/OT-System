require('dotenv').config();

const express = require('express');
const cors = require('cors');

const { initDb } = require('./config/db');
const { assignOt, getEmployees, requireBoss, tgApi, tgErrorMessage } = require('./controllers/otController');
const { handleWebhook } = require('./controllers/botController');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Fail fast on missing config ----
['DATABASE_URL', 'BOT_TOKEN', 'BOSS_ID', 'GROUP_CHAT_ID'].forEach((key) => {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
});

// ---- Middleware ----
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Telegram-Init-Data'],
  })
);
app.use(express.json({ limit: '100kb' }));

// ---- Routes ----
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.get('/api/employees', requireBoss, getEmployees);
app.post('/api/assign-ot', requireBoss, assignOt);

app.post('/webhook', handleWebhook);

// ---- 404 + error handler ----
app.use((_req, res) => res.status(404).json({ success: false, message: 'Not found' }));
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ---- Start ----
async function registerWebhook() {
  const baseUrl = (process.env.WEBHOOK_URL || '').replace(/\/$/, '');
  if (!baseUrl) {
    console.log('WEBHOOK_URL not set: skipping Telegram webhook registration');
    return;
  }
  try {
    await tgApi('setWebhook', {
      url: `${baseUrl}/webhook`,
      secret_token: process.env.WEBHOOK_SECRET || undefined,
      allowed_updates: ['callback_query', 'message'],
    });
    console.log(`Telegram webhook set to ${baseUrl}/webhook`);
  } catch (err) {
    console.error('Failed to set Telegram webhook:', tgErrorMessage(err));
  }
}

(async () => {
  try {
    await initDb();
    app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
    await registerWebhook();
  } catch (err) {
    console.error('Startup failed:', err);
    process.exit(1);
  }
})();