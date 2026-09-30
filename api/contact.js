'use strict';

const { randomUUID } = require('node:crypto');

const SITE = {
  name: 'Tampa',
  slug: 'tampa',
  url: 'https://bath-professional.com',
  origins: ['https://bath-professional.com', 'https://www.bath-professional.com'],
  phone: '(813) 445-9319',
};
const RECIPIENT = 'support@bathprofessional.com';
const SENDER = 'Bath Professional <website@bathprofessional.com>';
const MAX_BYTES = 24576;
const WINDOW_MS = 10 * 60 * 1000;
// A best-effort per-instance burst limit, in addition to origin and honeypot checks.
const attempts = new Map();

function respond(req, res, status, success, message, code) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const data = { success, message, ...(code ? { code } : {}) };
  res.statusCode = status;
  if ((req.headers.accept || '').includes('application/json')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify(data));
  }

  // The same endpoint also supports the form's native POST when JavaScript is off.
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
  const title = success ? 'Message sent' : 'Message not sent';
  const escaped = message.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  return res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} | Bath Professional</title><style>body{font:18px/1.6 system-ui,sans-serif;max-width:40rem;margin:10vh auto;padding:1.5rem;color:#173432}a{color:#075b51}</style></head><body><main><h1>${title}</h1><p>${escaped}</p>${success ? '' : '<p>Use your browser’s Back button to return to your entered information.</p>'}<p><a href="${SITE.url}/#contact">Return to Bath Professional</a></p></main></body></html>`);
}

function allowedOrigin(req) {
  const allowed = new Set(SITE.origins);
  for (const host of [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]) {
    if (host) allowed.add(`https://${host}`);
  }
  if (!process.env.VERCEL) {
    allowed.add('http://localhost:8080');
    allowed.add('http://127.0.0.1:8080');
  }
  try {
    const origin = req.headers.origin || new URL(req.headers.referer).origin;
    return allowed.has(origin);
  } catch {
    return false;
  }
}

async function readBody(req) {
  const type = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!['application/json', 'application/x-www-form-urlencoded'].includes(type)) {
    throw Object.assign(new Error('Unsupported request format.'), { status: 415 });
  }
  if (Number(req.headers['content-length']) > MAX_BYTES) {
    throw Object.assign(new Error('Your message is too long.'), { status: 413 });
  }
  let body = req.body;
  if (body === undefined) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BYTES) throw Object.assign(new Error('Your message is too long.'), { status: 413 });
      chunks.push(Buffer.from(chunk));
    }
    body = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (Buffer.byteLength(typeof body === 'string' ? body : JSON.stringify(body)) > MAX_BYTES) {
    throw Object.assign(new Error('Your message is too long.'), { status: 413 });
  }
  if (typeof body === 'string') {
    body = type === 'application/json' ? JSON.parse(body) : Object.fromEntries(new URLSearchParams(body));
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid form data.');
  return body;
}

function validate(body) {
  const limits = { name: 120, email: 254, phone: 40, zip_code: 5, message: 5000 };
  const values = {};
  for (const [field, max] of Object.entries(limits)) {
    if (typeof body[field] !== 'string' || !body[field].trim() || body[field].trim().length > max) return null;
    values[field] = body[field].trim();
  }
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(values.email)) return null;
  if (!/^\d{5}$/.test(values.zip_code)) return null;
  if (!/^[\d+().\-\s]+$/.test(values.phone) || values.phone.replace(/\D/g, '').length < 7) return null;
  if (/[\r\n\u0000]/.test(values.name + values.email + values.phone) || values.message.includes('\u0000')) return null;
  if (body.request_id && (typeof body.request_id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.request_id))) return null;
  return values;
}

function rateLimited(req) {
  const now = Date.now();
  for (const [key, entry] of attempts) {
    if (entry.expires <= now) attempts.delete(key);
  }
  const forwarded = req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'];
  const key = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket?.remoteAddress;
  if (!key) return false;
  const entry = attempts.get(key) || { count: 0, expires: now + WINDOW_MS };
  if (entry.count >= 5) return true;
  // Bound memory even if a large number of different clients reaches an instance.
  if (attempts.size >= 10000 && !attempts.has(key)) return true;
  entry.count++;
  attempts.set(key, entry);
  return false;
}

module.exports = async function contact(req, res) {
  const fallback = `Please call ${SITE.phone}, or email ${RECIPIENT} directly.`;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return respond(req, res, 405, false, 'Please submit the contact form on our website.', 'METHOD_NOT_ALLOWED');
  }
  if (!allowedOrigin(req)) {
    return respond(req, res, 403, false, 'Please submit the contact form on our website.', 'ORIGIN_NOT_ALLOWED');
  }

  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    return respond(req, res, error.status || 400, false, 'Please check your form information and message length.', 'INVALID_REQUEST');
  }
  if (body.website) {
    return respond(req, res, 400, false, 'We could not submit this form. ' + fallback, 'INVALID_REQUEST');
  }
  const values = validate(body);
  if (!values) {
    return respond(req, res, 400, false, 'Please enter a name, valid email, phone number, five-digit ZIP code, and message (up to 5,000 characters).', 'VALIDATION_ERROR');
  }
  if (!process.env.RESEND_API_KEY) {
    console.error('Contact email configuration missing', { site: SITE.slug });
    return respond(req, res, 503, false, 'Online messaging is temporarily unavailable. ' + fallback, 'SERVICE_UNAVAILABLE');
  }
  if (rateLimited(req)) {
    res.setHeader('Retry-After', '600');
    return respond(req, res, 429, false, 'Please wait a few minutes before sending another message. ' + fallback, 'RATE_LIMITED');
  }

  const requestId = body.request_id || randomUUID();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `contact-${SITE.slug}-${requestId}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        from: SENDER,
        to: [RECIPIENT],
        reply_to: values.email,
        subject: `New Contact Message — Bath Professional ${SITE.name}`,
        text: [
          `New website inquiry from Bath Professional ${SITE.name}`,
          `Website: ${SITE.url}`,
          '',
          `Name: ${values.name}`,
          `Email: ${values.email}`,
          `Phone: ${values.phone}`,
          `ZIP code: ${values.zip_code}`,
          '',
          'Message:',
          values.message,
        ].join('\n'),
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || typeof data.id !== 'string' || !data.id) {
      console.error('Contact email provider rejected submission', { site: SITE.slug, status: response.status, requestId });
      return respond(req, res, 502, false, 'We could not send your message right now. ' + fallback, 'DELIVERY_FAILED');
    }
    console.info('Contact email accepted', { site: SITE.slug, requestId, emailId: data.id });
    return respond(req, res, 200, true, "Thank you! Your message was sent to our team. We'll reply shortly.");
  } catch (error) {
    const timedOut = controller.signal.aborted;
    console.error('Contact email request failed', { site: SITE.slug, requestId, reason: timedOut ? 'timeout' : 'network' });
    return respond(req, res, timedOut ? 504 : 502, false, 'We could not confirm your message was sent. ' + fallback, timedOut ? 'DELIVERY_TIMEOUT' : 'DELIVERY_FAILED');
  } finally {
    clearTimeout(timeout);
  }
};
