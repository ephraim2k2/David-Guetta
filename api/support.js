'use strict';

const { handleSupport, handleSupportMessages } = require('../lib/telegram');

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    try {
      const payload = await handleSupportMessages(req);
      return res.status(200).json(payload);
    } catch (err) {
      return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  try {
    const payload = await handleSupport(req);
    return res.status(200).json(payload);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
};
