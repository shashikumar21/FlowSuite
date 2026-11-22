/**
 * Self-contained browser widget injected by the embed snippet. It is plain JS
 * on purpose: it can be pasted into any website without a build step. It only
 * knows a public key and the ai-chat URL; no secret is ever embedded.
 */
export const WIDGET_SCRIPT = `(function () {
  if (window.__flowSuiteChatLoaded) return;
  window.__flowSuiteChatLoaded = true;
  var config = window.FLOW_SUITE_CHAT || {};
  if (!config.endpoint || !config.publicKey) return;

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    var panel = document.createElement('div');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Website assistant');
    panel.style.cssText = 'position:fixed;bottom:84px;right:20px;width:340px;max-width:calc(100vw - 40px);max-height:520px;display:none;flex-direction:column;background:#fff;border:1px solid #e5e7eb;border-radius:16px;box-shadow:0 20px 45px rgba(15,23,42,.2);font-family:system-ui,-apple-system,Segoe UI,sans-serif;z-index:2147483000;overflow:hidden';

    var header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:10px;padding:14px 16px;background:#0f172a;color:#fff';
    var title = document.createElement('div');
    title.textContent = config.agentName || 'AI assistant';
    title.style.cssText = 'font-weight:700;font-size:14px';
    header.appendChild(title);
    panel.appendChild(header);

    var feed = document.createElement('div');
    feed.setAttribute('aria-live', 'polite');
    feed.style.cssText = 'flex:1;overflow-y:auto;padding:14px;background:#f8fafc;min-height:200px;display:flex;flex-direction:column;gap:8px';
    panel.appendChild(feed);

    function bubble(text, mine) {
      var el = document.createElement('div');
      el.textContent = text;
      el.style.cssText = 'max-width:85%;padding:9px 12px;border-radius:12px;font-size:13px;line-height:1.45;' +
        (mine ? 'align-self:flex-end;background:#4f46e5;color:#fff' : 'align-self:flex-start;background:#fff;color:#0f172a;border:1px solid #e5e7eb');
      feed.appendChild(el);
      feed.scrollTop = feed.scrollHeight;
    }

    var form = document.createElement('form');
    form.style.cssText = 'border-top:1px solid #e5e7eb;padding:12px;display:flex;flex-direction:column;gap:8px';

    // Host sites often set a global min-height on inputs. Reset it here so the
    // lead-capture fields stay compact and do not squeeze the conversation.
    var inputStyle = 'height:34px;min-height:0;box-sizing:border-box;width:100%;border:1px solid #d1d5db;border-radius:8px;padding:0 10px;font-size:13px';

    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Your name (optional)';
    nameInput.setAttribute('aria-label', 'Your name');
    nameInput.style.cssText = inputStyle;

    var emailInput = document.createElement('input');
    emailInput.type = 'email';
    emailInput.placeholder = 'Email (optional)';
    emailInput.setAttribute('aria-label', 'Your email');
    emailInput.style.cssText = inputStyle;

    var phoneInput = document.createElement('input');
    phoneInput.type = 'tel';
    phoneInput.placeholder = 'Phone (optional)';
    phoneInput.setAttribute('aria-label', 'Your phone');
    phoneInput.style.cssText = inputStyle;

    var messageInput = document.createElement('input');
    messageInput.type = 'text';
    messageInput.placeholder = 'Ask a question...';
    messageInput.setAttribute('aria-label', 'Message');
    messageInput.style.cssText = inputStyle;

    var consentLabel = document.createElement('label');
    consentLabel.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:11px;color:#475569';
    var consent = document.createElement('input');
    consent.type = 'checkbox';
    consentLabel.appendChild(consent);
    consentLabel.appendChild(document.createTextNode('I agree to WhatsApp follow-ups'));

    var send = document.createElement('button');
    send.type = 'submit';
    send.textContent = 'Send';
    send.style.cssText = 'height:36px;border:0;border-radius:8px;background:#4f46e5;color:#fff;font-weight:700;font-size:13px;cursor:pointer';

    var notice = document.createElement('div');
    notice.style.cssText = 'font-size:12px;color:#b91c1c;display:none';

    form.appendChild(nameInput);
    form.appendChild(emailInput);
    form.appendChild(phoneInput);
    form.appendChild(messageInput);
    form.appendChild(consentLabel);
    form.appendChild(notice);
    form.appendChild(send);
    panel.appendChild(form);

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.textContent = 'Chat';
    toggle.setAttribute('aria-label', 'Open or close AI chat');
    toggle.style.cssText = 'position:fixed;bottom:20px;right:20px;height:48px;padding:0 20px;border:0;border-radius:999px;background:#4f46e5;color:#fff;font-weight:700;font-size:14px;box-shadow:0 10px 25px rgba(79,70,229,.35);cursor:pointer;z-index:2147483001';
    toggle.onclick = function () {
      var open = panel.style.display === 'flex';
      panel.style.display = open ? 'none' : 'flex';
      if (!open) messageInput.focus();
    };

    document.body.appendChild(panel);
    document.body.appendChild(toggle);
    bubble('Hi! Ask me about services, hours or booking.', false);

    var history = [];
    var detailsCaptured = false;
    function captureContactDetails() {
      if (detailsCaptured) return;
      detailsCaptured = true;
      // Values stay in the hidden inputs so every request still carries them.
      // Only the fields are removed from view: the conversation gets the space.
      [nameInput, emailInput, phoneInput].forEach(function (field) {
        field.style.display = 'none';
      });
      form.style.gap = '8px';
    }

    form.onsubmit = function (event) {
      event.preventDefault();
      var text = messageInput.value.trim();
      if (!text) return;
      bubble(text, true);
      history.push({ role: 'user', content: text });
      history = history.slice(-10);
      messageInput.value = '';
      send.disabled = true;
      notice.style.display = 'none';
      captureContactDetails();

      fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicKey: config.publicKey,
          message: text,
          name: nameInput.value.trim() || null,
          phone: phoneInput.value.trim() || null,
          email: emailInput.value.trim() || null,
          consentToWhatsapp: consent.checked,
          history: history,
          idempotencyKey: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random()
        })
      })
        .then(function (response) { return response.json().then(function (body) { return { status: response.status, body: body }; }); })
        .then(function (result) {
          if (!result.body.ok || typeof result.body.reply !== 'string') {
            notice.textContent = (result.body.error && result.body.error.code) ? ('Chat unavailable: ' + result.body.error.code) : 'Chat unavailable.';
            notice.style.display = 'block';
            return;
          }
          bubble(result.body.reply, false);
          history.push({ role: 'assistant', content: result.body.reply });
          history = history.slice(-10);
        })
        .catch(function () {
          notice.textContent = 'Could not reach the chat service.';
          notice.style.display = 'block';
        })
        .finally(function () { send.disabled = false; });
    };
  });
})();`
