/* Submit contact messages through the site's own contact endpoint. */
(function () {
  'use strict';

  const FORM_ENDPOINT = '/api/contact';
  const SUPPORT_DETAILS = 'Please call (813) 445-9319, or email support@bathprofessional.com directly.';
  const contactForm = document.getElementById('contactForm');
  const contactStatus = document.getElementById('contactFormStatus');
  const contactBtn = document.getElementById('contactSubmitBtn');
  let sending = false;
  let requestPayload = null;
  let requestId = null;

  // The form's native POST remains available if JavaScript support is limited.
  if (!contactForm || !contactBtn || typeof fetch !== 'function' || typeof AbortController !== 'function') {
    return;
  }

  function setStatus(message, type) {
    if (!contactStatus) return;
    contactStatus.textContent = message;
    contactStatus.classList.remove('hidden', 'success', 'error', 'pending');
    contactStatus.classList.add(type);
  }

  function submissionError(message) {
    const error = new Error(message);
    error.customerMessage = message;
    return error;
  }

  function createRequestId() {
    const browserCrypto = globalThis.crypto;
    if (typeof browserCrypto?.randomUUID === 'function') {
      return browserCrypto.randomUUID();
    }
    if (typeof browserCrypto?.getRandomValues !== 'function') return null;

    const bytes = browserCrypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  async function sendToSupport(payload) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(FORM_ENDPOINT, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      let data;
      try {
        data = await response.json();
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        throw submissionError('We could not confirm your message was sent. ' + SUPPORT_DETAILS);
      }

      if (!response.ok || data?.success !== true) {
        throw submissionError(
          typeof data?.message === 'string' && data.message.trim()
            ? data.message
            : 'We could not send your message right now. ' + SUPPORT_DETAILS
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  contactForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (sending) return;

    const fields = ['name', 'email', 'phone', 'zip_code', 'message', 'website'];
    const payload = {};
    const submittedFields = [];
    for (const name of fields) {
      const field = contactForm.elements.namedItem(name);
      if (field) {
        field.value = field.value.trim();
        payload[name] = field.value;
        submittedFields.push({ field, readOnly: field.readOnly });
      }
    }

    if (!contactForm.reportValidity()) return;

    // Reusing this ID makes an unchanged retry safe after an uncertain response.
    const payloadKey = JSON.stringify(payload);
    if (payloadKey !== requestPayload) {
      requestPayload = payloadKey;
      requestId = createRequestId();
    }
    if (requestId) payload.request_id = requestId;

    sending = true;
    for (const { field } of submittedFields) field.readOnly = true;
    contactBtn.disabled = true;
    contactForm.setAttribute('aria-busy', 'true');
    setStatus('Sending your message…', 'pending');

    try {
      await sendToSupport(payload);
      requestPayload = null;
      requestId = null;
      contactForm.reset();
      setStatus('Thank you! Your message was sent to our team. We\'ll reply shortly.', 'success');
    } catch (error) {
      const message = error?.name === 'AbortError'
        ? 'Sending took too long, so we could not confirm your message was received. ' + SUPPORT_DETAILS
        : error?.customerMessage || 'We could not confirm your message was sent. ' + SUPPORT_DETAILS;
      setStatus(message, 'error');
    } finally {
      for (const { field, readOnly } of submittedFields) field.readOnly = readOnly;
      sending = false;
      contactBtn.disabled = false;
      contactForm.removeAttribute('aria-busy');
    }
  });
})();
