'use strict';

const escapeHtml = (str = '') =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

async function sendTelegramMessage(htmlText) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
  const chatId = process.env.TELEGRAM_CHAT_ID || '';

  if (!botToken || !chatId) {
    return { ok: false, skipped: true, reason: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured' };
  }

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
  return data;
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

module.exports = {
  handleVisit,
  handleInquiry
};
