/*
 * Image upload for the admin forms. An <input data-image-upload> keeps its URL
 * field (an uploaded image's URL, or any http(s) image URL)
 * and gains an upload button and a preview. The file goes to
 * POST /event/api/uploads, which checks it and stores it in this system's own
 * R2 bucket.
 */
(function () {
  var MAX_BYTES = 5 * 1024 * 1024;
  var ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/avif';

  function t(key, params) {
    return window.__t ? window.__t(key, params) : key;
  }

  function enhance(input) {
    if (input.dataset.uploadReady) return;
    input.dataset.uploadReady = '1';

    var bar = document.createElement('div');
    bar.className = 'image-upload-bar';
    var file = document.createElement('input');
    file.type = 'file';
    file.accept = ACCEPT;
    file.hidden = true;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-secondary btn-sm';
    button.setAttribute('data-i18n', 'upload.button');
    button.textContent = t('upload.button');
    var status = document.createElement('span');
    status.className = 'image-upload-status';
    status.setAttribute('role', 'status');
    var preview = document.createElement('img');
    preview.className = 'image-upload-preview';
    preview.alt = '';
    preview.hidden = true;
    preview.addEventListener('error', function () { preview.hidden = true; });
    bar.append(button, status, file);
    input.insertAdjacentElement('afterend', bar);
    bar.insertAdjacentElement('afterend', preview);

    function showPreview() {
      var v = input.value.trim();
      var ok = v.indexOf('/event/media/') === 0 || /^https?:\/\//.test(v);
      preview.hidden = !ok;
      if (ok && preview.getAttribute('src') !== v) preview.src = v;
    }
    // Forms fill the field from script; they announce it with an `input` event.
    input.addEventListener('input', showPreview);
    input.addEventListener('change', showPreview);
    if (input.form) input.form.addEventListener('reset', function () { setTimeout(showPreview); });
    showPreview();

    button.addEventListener('click', function () { file.click(); });
    file.addEventListener('change', async function () {
      var chosen = file.files && file.files[0];
      file.value = '';
      if (!chosen) return;
      if (chosen.size > MAX_BYTES) {
        status.textContent = t('upload.tooLarge');
        return;
      }
      button.disabled = true;
      status.textContent = t('upload.uploading');
      try {
        var res = await fetch('/event/api/uploads', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': chosen.type || 'application/octet-stream' },
          body: chosen,
        });
        var data = await res.json().catch(function () { return null; });
        if (res.ok && data && data.url) {
          input.value = data.url;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          status.textContent = t('upload.done');
        } else {
          var code = data && data.error;
          status.textContent =
            code === 'image_too_large' ? t('upload.tooLarge')
            : code === 'unsupported_image_type' || code === 'invalid_image' ? t('upload.unsupported')
            : t('upload.failed');
        }
      } catch (e) {
        status.textContent = t('upload.failed');
      } finally {
        button.disabled = false;
      }
    });
  }

  function init() {
    document.querySelectorAll('input[data-image-upload]').forEach(enhance);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
