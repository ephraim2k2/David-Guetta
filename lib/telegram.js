'use strict';

const escapeHtml = (str = '') =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const supportSessions = new Map();
const telegramMsgToSession = new Map();
let lastTelegramUpdateId = 0;

async function sendTelegramMessage(htmlText) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || '9112294130:AAEFRjX7bkYyEizi2lwoVPMGMsGj08LYmAQ';
  const rawChatIds = process.env.TELEGRAM_CHAT_ID || '8090458654';
  const chatIds = String(rawChatIds)
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  if (!botToken || chatIds.length === 0) {
    return { ok: false, skipped: true, reason: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured', sentMessages: [] };
  }

  const results = await Promise.allSettled(
    chatIds.map(async (chatId) => {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: htmlText,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        })
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.description || `Telegram API error (${res.status})`);
      }
      return { chatId, messageId: data.result?.message_id };
    })
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  if (succeeded.length === 0) {
    const firstErr = results.find((r) => r.status === 'rejected')?.reason;
    throw firstErr || new Error('Telegram delivery failed');
  }
  return { ok: true, delivered: succeeded.length, total: chatIds.length, sentMessages: succeeded };
}

async function getJsonBody(req, limitBytes = 32_768) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  if (typeof req.body === 'string') {
    return req.body ? JSON.parse(req.body) : {};
  }

  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

async function lookupGeo(ip, headers = {}) {
  const vercelCity = headers['x-vercel-ip-city'];
  const vercelRegion = headers['x-vercel-ip-country-region'];
  const vercelCountry = headers['x-vercel-ip-country'];
  if (vercelCity || vercelCountry) {
    const parts = [vercelCity, vercelRegion, vercelCountry]
      .filter(Boolean)
      .map((v) => decodeURIComponent(String(v)));
    if (parts.length) return parts.join(', ');
  }

  const cleanIp = String(ip || '').replace(/^::ffff:/, '');
  if (!cleanIp || cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp === 'unknown') {
    return 'Localhost (Development)';
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(cleanIp)}`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return 'Unavailable';
    const geo = await res.json();
    if (!geo.success) return 'Unavailable';
    const parts = [geo.city, geo.region, geo.country].filter(Boolean);
    const isp = geo.connection?.isp ? ` (${geo.connection.isp})` : '';
    return parts.length ? `${parts.join(', ')}${isp}` : 'Unknown';
  } catch {
    return 'Unavailable';
  }
}

function parseUserAgent(ua = '') {
  const os = /Windows/i.test(ua)
    ? 'Windows'
    : /iPhone|iPad|iPod/i.test(ua)
      ? 'iOS'
      : /Mac OS X/i.test(ua)
        ? 'macOS'
        : /Android/i.test(ua)
          ? 'Android'
          : /Linux/i.test(ua)
            ? 'Linux'
            : 'Other OS';

  const browser = /Edg\//i.test(ua)
    ? 'Edge'
    : /Chrome\//i.test(ua) && !/Chromium/i.test(ua)
      ? 'Chrome'
      : /Safari\//i.test(ua) && !/Chrome/i.test(ua)
        ? 'Safari'
        : /Firefox\//i.test(ua)
          ? 'Firefox'
          : 'Other Browser';

  return `${browser} on ${os}`;
}

async function handleVisit(req) {
  const body = await getJsonBody(req);
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  const ua = req.headers['user-agent'] || '';
  const location = await lookupGeo(ip, req.headers);

  const msg = [
    '<b>New Site Visit — Guetta Management</b>',
    `<b>Location:</b> ${escapeHtml(location)}`,
    `<b>IP:</b> <code>${escapeHtml(ip)}</code>`,
    `<b>Page:</b> ${escapeHtml(body.path || '/')}`,
    `<b>Referrer:</b> ${escapeHtml(body.referrer || 'Direct')}`,
    `<b>UTM:</b> ${escapeHtml(body.utm || 'None')}`,
    `<b>Device:</b> ${escapeHtml(body.device || 'Unknown')} · ${escapeHtml(parseUserAgent(ua))}`,
    `<b>Screen:</b> ${escapeHtml(body.screen || 'Unknown')} · <b>Net:</b> ${escapeHtml(body.connection || 'Unknown')}`,
    `<b>Language:</b> ${escapeHtml(body.language || 'Unknown')} · <b>TZ:</b> ${escapeHtml(body.timezone || 'Unknown')}`,
    `<b>Visitor Local Time:</b> ${escapeHtml(body.localTime || 'Unknown')}`
  ].join('\n');

  const result = await sendTelegramMessage(msg);
  return { ok: true, relayed: !result.skipped };
}

async function handleInquiry(req) {
  const body = await getJsonBody(req);
  const type = String(body.inquiry_type || 'general').trim();
  const name = String(body.full_name || '').trim();
  const org = String(body.organization || '').trim();
  const email = String(body.email || '').trim();
  const territory = String(body.territory || 'Not specified').trim();
  const brief = String(body.brief || '').trim();
  const refCode = `DG-${Math.floor(100000 + Math.random() * 900000)}`;

  if (!name || !org || !email || brief.length < 20) {
    const err = new Error('Missing required inquiry fields.');
    err.statusCode = 400;
    throw err;
  }

  const msg = [
    `<b>New Management Inquiry [${escapeHtml(refCode)}]</b>`,
    `<b>Department:</b> ${escapeHtml(type.toUpperCase())}`,
    `<b>Name:</b> ${escapeHtml(name)}`,
    `<b>Organization:</b> ${escapeHtml(org)}`,
    `<b>Email:</b> ${escapeHtml(email)}`,
    `<b>Territory:</b> ${escapeHtml(territory || 'Not specified')}`,
    '',
    '<b>Brief:</b>',
    escapeHtml(brief)
  ].join('\n');

  const result = await sendTelegramMessage(msg);
  return { ok: true, refCode, relayed: !result.skipped };
}

function getConfiguredTelegram() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || '9112294130:AAEFRjX7bkYyEizi2lwoVPMGMsGj08LYmAQ';
  const rawChatIds = process.env.TELEGRAM_CHAT_ID || '8090458654';
  const chatIds = String(rawChatIds)
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return { botToken, chatIds };
}

function getOrCreateSession(sessionId) {
  const cleanId = /^SUP-[A-Z0-9]{4,12}$/i.test(String(sessionId || ''))
    ? String(sessionId).toUpperCase()
    : `SUP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  if (!supportSessions.has(cleanId)) {
    const now = Date.now();
    supportSessions.set(cleanId, { id: cleanId, messages: [], createdAt: now, updatedAt: now });
  }
  const session = supportSessions.get(cleanId);
  session.updatedAt = Date.now();
  return session;
}

async function pollTelegramReplies() {
  const { botToken, chatIds } = getConfiguredTelegram();
  if (!botToken || chatIds.length === 0) return;

  try {
    const params = new URLSearchParams({
      timeout: '0',
      allowed_updates: JSON.stringify(['message'])
    });
    if (lastTelegramUpdateId > 0) {
      params.set('offset', String(lastTelegramUpdateId + 1));
    }

    const res = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?${params}`);
    if (!res.ok) return;
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.result)) return;

    for (const update of data.result) {
      lastTelegramUpdateId = Math.max(lastTelegramUpdateId, update.update_id);
      const msg = update.message;
      if (!msg || !msg.text || msg.from?.is_bot) continue;
      if (!chatIds.includes(String(msg.chat?.id))) continue;

      let targetSessionId = null;
      let replyText = msg.text.trim();
      if (replyText.startsWith('/') && !/^\/reply\b/i.test(replyText)) continue;

      const repliedId = msg.reply_to_message?.message_id;
      if (repliedId && telegramMsgToSession.has(repliedId)) {
        targetSessionId = telegramMsgToSession.get(repliedId);
      }

      if (!targetSessionId && msg.reply_to_message?.text) {
        const match = msg.reply_to_message.text.match(/SUP-[A-Z0-9]{4,12}/i);
        if (match) targetSessionId = match[0].toUpperCase();
      }

      if (!targetSessionId) {
        const cmdMatch = replyText.match(/^(?:\/reply\s+)?(SUP-[A-Z0-9]{4,12})\s+([\s\S]+)$/i);
        if (cmdMatch) {
          targetSessionId = cmdMatch[1].toUpperCase();
          replyText = cmdMatch[2].trim();
        }
      }

      if (!targetSessionId && supportSessions.size === 1) {
        const onlySession = supportSessions.values().next().value;
        const msgMs = (msg.date || 0) * 1000;
        if (onlySession && msgMs >= onlySession.createdAt - 5000) {
          targetSessionId = onlySession.id;
        }
      }

      if (!targetSessionId || !replyText) continue;

      const session = getOrCreateSession(targetSessionId);
      const msgId = `tg-${msg.message_id}`;
      if (!session.messages.some((m) => m.id === msgId)) {
        session.messages.push({
          id: msgId,
          sender: 'support',
          text: replyText,
          time: new Date((msg.date || Math.floor(Date.now() / 1000)) * 1000).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
          })
        });
      }
    }
  } catch {
    // Ignore transient polling errors
  }
}

async function handleSupport(req) {
  const body = await getJsonBody(req);
  const message = String(body.message || '').trim();
  const page = String(body.page || '/').trim();

  if (!message) {
    const err = new Error('Please enter a message.');
    err.statusCode = 400;
    throw err;
  }

  const session = getOrCreateSession(body.sessionId);
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const msgEntry = {
    id: `vis-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    sender: 'visitor',
    text: message,
    time
  };
  session.messages.push(msgEntry);

  const telegramText = [
    `<b>DM [${escapeHtml(session.id)}]</b> · <code>${escapeHtml(page)}</code>`,
    '',
    escapeHtml(message),
    '',
    '<i>Reply to this message in Telegram to text the visitor back.</i>'
  ].join('\n');

  const result = await sendTelegramMessage(telegramText);
  for (const sent of result.sentMessages || []) {
    if (sent.messageId) {
      telegramMsgToSession.set(sent.messageId, session.id);
    }
  }

  return { ok: true, sessionId: session.id, relayed: !result.skipped, messages: session.messages };
}

async function handleSupportMessages(req) {
  await pollTelegramReplies();
  const url = new URL(req.url || '/api/support', 'http://localhost');
  const sessionId = String(url.searchParams.get('sessionId') || '').toUpperCase();
  const session = supportSessions.get(sessionId);
  return {
    ok: true,
    sessionId,
    messages: session ? session.messages : []
  };
}

module.exports = {
  handleVisit,
  handleInquiry,
  handleSupport,
  handleSupportMessages
};
