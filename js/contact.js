// İletişim formunu AJAX ile mail.php'ye gönderir.
(function () {
  var form = document.getElementById('mo-contact-form');
  if (!form) return;
  var box = document.getElementById('body_div_mesaj');
  var btn = document.getElementById('body_btnGonder');
  var lang = (form.querySelector('[name=lang]') || {}).value || 'tr';
  var T = {
    tr: { wait: 'Gönderiliyor...', fail: 'Mesaj gönderilemedi. Lütfen daha sonra tekrar deneyin.', req: 'Lütfen zorunlu (*) alanları doldurun.' },
    en: { wait: 'Sending...', fail: 'Your message could not be sent. Please try again later.', req: 'Please fill in the required (*) fields.' },
    de: { wait: 'Wird gesendet...', fail: 'Die Nachricht konnte nicht gesendet werden. Bitte versuchen Sie es später erneut.', req: 'Bitte füllen Sie die Pflichtfelder (*) aus.' }
  }[lang] || {};
  function show(ok, text) {
    box.innerHTML = '';
    var p = document.createElement('p');
    p.setAttribute('role', 'alert');
    p.style.cssText = 'padding:12px 15px;margin:0 0 15px;color:#fff;background:' + (ok ? '#2e9e4f' : '#d9534f');
    p.textContent = text;
    box.appendChild(p);
  }
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (!form.checkValidity()) { form.reportValidity ? form.reportValidity() : show(false, T.req); return; }
    var label = btn.textContent;
    btn.disabled = true; btn.textContent = T.wait;
    fetch(form.getAttribute('action'), { method: 'POST', body: new FormData(form), headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.json().catch(function () { return { ok: false, message: T.fail }; }); })
      .then(function (d) { show(!!d.ok, d.message || T.fail); if (d.ok) form.reset(); })
      .catch(function () { show(false, T.fail); })
      .then(function () { btn.disabled = false; btn.textContent = label; });
  });
})();
