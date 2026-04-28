/**
 * ApplyPilot — serialize visible form fields and apply autofill assignments (main document MVP).
 * Injected into the active tab via chrome.scripting.executeScript; exposes globals on window.
 */
(function () {
  'use strict';

  var MAX_FIELDS = 60;
  var SKIP_INPUT_TYPES = {
    hidden: true,
    button: true,
    submit: true,
    reset: true,
    image: true,
    file: true,
    password: true,
    checkbox: true,
    radio: true
  };

  function visible(el) {
    if (!(el instanceof HTMLElement)) return false;
    if (el.disabled) return false;
    var st = window.getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function labelTextFor(el) {
    var parts = [];
    try {
      if (el.labels && el.labels.length) {
        for (var i = 0; i < el.labels.length; i++) {
          var t = (el.labels[i].innerText || '').replace(/\s+/g, ' ').trim();
          if (t) parts.push(t);
        }
      }
    } catch (e) {
      /* ignore */
    }
    if (el.getAttribute('aria-label')) {
      parts.push(String(el.getAttribute('aria-label')).trim());
    }
    if (el.getAttribute('placeholder')) {
      parts.push(String(el.getAttribute('placeholder')).trim());
    }
    var joined = parts.filter(Boolean).join(' — ');
    if (joined.length > 600) joined = joined.slice(0, 597) + '…';
    return joined;
  }

  function clearPreviousMarkers() {
    try {
      document.querySelectorAll('[data-jaa-fid]').forEach(function (n) {
        n.removeAttribute('data-jaa-fid');
      });
    } catch (e) {
      /* ignore */
    }
  }

  function serialize() {
    clearPreviousMarkers();
    var warnings = [];
    warnings.push('Only fields in this page document are included (not inside iframes).');

    var candidates = [];
    try {
      candidates = Array.prototype.slice.call(document.querySelectorAll('input, textarea, select'));
    } catch (e2) {
      return { fields: [], page_url: String(location.href || ''), warnings: warnings.concat(['Could not query form elements.']) };
    }

    var fields = [];
    for (var i = 0; i < candidates.length && fields.length < MAX_FIELDS; i++) {
      var el = candidates[i];
      if (!visible(el)) continue;
      var tag = el.tagName.toLowerCase();
      var inputType = (el.type || '').toLowerCase();
      if (tag === 'input' && SKIP_INPUT_TYPES[inputType]) continue;

      var uid = String(fields.length);
      el.setAttribute('data-jaa-fid', uid);

      var row = {
        field_uid: uid,
        tag: tag,
        input_type: tag === 'input' ? inputType : null,
        name_attr: el.name || null,
        id_attr: el.id || null,
        label_text: labelTextFor(el),
        placeholder: el.getAttribute('placeholder') || null,
        aria_label: el.getAttribute('aria-label') || null,
        required: !!el.required,
        max_length: el.maxLength > 0 ? el.maxLength : null,
        options: null
      };

      if (tag === 'select') {
        var opts = [];
        for (var j = 0; j < el.options.length && j < 40; j++) {
          var o = el.options[j];
          opts.push({
            value: String(o.value || ''),
            text: String(o.text || '').slice(0, 200)
          });
        }
        row.options = opts;
      }

      fields.push(row);
    }

    return {
      fields: fields,
      page_url: String(location.href || ''),
      warnings: warnings
    };
  }

  function setNativeValue(el, value) {
    try {
      var proto = Object.getPrototypeOf(el);
      var desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) {
        desc.set.call(el, value);
      } else {
        el.value = value;
      }
    } catch (e) {
      try {
        el.value = value;
      } catch (e2) {
        /* ignore */
      }
    }
    try {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e3) {
      /* ignore */
    }
  }

  function applySelect(el, value) {
    var v = String(value);
    el.value = v;
    if (el.value === v) {
      setNativeValue(el, v);
      return true;
    }
    var lower = v.toLowerCase();
    for (var i = 0; i < el.options.length; i++) {
      var o = el.options[i];
      if (String(o.text).toLowerCase().trim() === lower || String(o.value).toLowerCase() === lower) {
        el.selectedIndex = i;
        setNativeValue(el, o.value);
        return true;
      }
    }
    return false;
  }

  /**
   * @param {Array<{ field_uid: string, value: string }>} assignments
   * @returns {{ applied: number, failed: number }}
   */
  function applyAssignments(assignments) {
    var applied = 0;
    var failed = 0;
    if (!Array.isArray(assignments)) return { applied: 0, failed: 0 };

    for (var i = 0; i < assignments.length; i++) {
      var a = assignments[i];
      if (!a || typeof a.field_uid !== 'string') continue;
      var uidRaw = String(a.field_uid);
      // field_uid is always numeric from our serializer; reject anything else to avoid selector injection.
      if (!/^\d+$/.test(uidRaw)) {
        failed++;
        continue;
      }
      var el = document.querySelector('[data-jaa-fid="' + uidRaw + '"]');
      if (!el) {
        failed++;
        continue;
      }
      var val = a.value == null ? '' : String(a.value);
      var tag = el.tagName.toLowerCase();
      try {
        if (tag === 'select') {
          if (applySelect(el, val)) applied++;
          else failed++;
        } else {
          setNativeValue(el, val);
          applied++;
        }
      } catch (e) {
        failed++;
      }
    }
    return { applied: applied, failed: failed };
  }

  window.__jaaSerializeAutofillFields = serialize;
  window.__jaaApplyAutofillAssignments = applyAssignments;
})();
