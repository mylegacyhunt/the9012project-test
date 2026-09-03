/* Browser speech-to-text only. No audio files, uploads, analytics, or auto-save. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else api.mount(root);
}(typeof window === 'object' ? window : null, function () {
  'use strict';

  const errors = {
    'not-allowed': 'Microphone or speech permission was denied. Allow it in your browser settings, or use keyboard dictation.',
    'service-not-allowed': 'This browser cannot use its speech service here. Try Safari or Chrome, or use keyboard dictation.',
    'audio-capture': 'No microphone is available. Check your microphone, or use keyboard dictation.',
    'network': 'The speech service could not connect. Check your connection and try again, or use keyboard dictation.',
    'no-speech': 'No speech was heard. Select the microphone again and wait for “Listening” before speaking.',
    'language-not-supported': 'The speech service does not support this language. Use your keyboard’s dictation instead.',
    'aborted': 'Voice typing stopped. Your existing words are still here.'
  };

  function appendSpeech(base, spoken) {
    return spoken ? base + (base && !/\s$/.test(base) ? ' ' : '') + spoken : base;
  }

  // Kept independent of the page so races and failures can be tested without a mic.
  function createController(options) {
    let active = null;
    const undo = new Map();
    const later = options.setTimeout || setTimeout;
    const clear = options.clearTimeout || clearTimeout;
    const status = (field, message) => options.onStatus(field, message);
    const update = (s, message) => options.onState({ field: s.field, phase: s.phase, mode: s.mode, interim: s.interim, message });

    function retire(s, message, abort) {
      if (active !== s) return;
      active = null;
      for (const timer of s.timers) clear(timer);
      s.rec.onresult = s.rec.onerror = s.rec.onend = s.rec.onaudiostart = null;
      // A permission dialog can resolve after release/navigation. Never start late.
      s.rec.onstart = function () { try { s.rec.abort(); } catch (error) {} };
      if (abort) { try { s.rec.abort(); } catch (error) {} }
      s.field.lock(false);
      if (s.written !== s.base && s.field.read() === s.written) {
        undo.set(s.field.id, { before: s.base, after: s.written });
      }
      s.phase = 'idle';
      s.interim = '';
      update(s, message);
    }

    function cancel(message) {
      if (active) retire(active, message || 'Voice typing stopped. Review your words before saving.', true);
    }

    function finish(message) {
      const s = active;
      if (!s || s.phase === 'finishing') return;
      if (s.phase === 'starting') {
        cancel('Stopped before the microphone was ready. If asked, allow access, then select it again and wait for “Listening”.');
        return;
      }
      s.phase = 'finishing';
      s.endMessage = message;
      update(s, 'Finishing your words… Please wait before saving.');
      s.timers.push(later(function () {
        retire(s, 'The speech service took too long. Review the words captured; select the microphone again to add more.', true);
      }, 5000));
      try { s.rec.stop(); }
      catch (error) { retire(s, 'Voice typing stopped. Review the words captured before saving.', true); }
    }

    function start(field, mode) {
      if (active) { status(field, 'Finish the current voice entry before starting another.'); return false; }
      if (!field.editable()) { status(field, 'This text is not available for editing right now.'); return false; }
      let rec;
      try { rec = new options.Recognition(); }
      catch (error) { status(field, 'Voice typing is unavailable here. Use keyboard dictation or type your memory.'); return false; }
      const s = { field, rec, mode, phase: 'starting', base: field.read(), parts: [], interim: '', timers: [] };
      s.written = s.base;
      active = s;
      field.lock(true);
      update(s, 'Connecting to your microphone… Allow access if asked; wait for “Listening”.');
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.lang = options.lang || 'en-US';
      const started = function () {
        if (active !== s) { try { rec.abort(); } catch (error) {} return; }
        if (s.phase !== 'starting') return;
        s.phase = 'listening';
        clear(s.startTimer);
        update(s, mode === 'tap' ? 'Listening… Tap Stop when you’re finished.' : 'Listening… Keep holding. Release when you’re finished.');
      };
      rec.onstart = rec.onaudiostart = started;
      rec.onresult = function (event) {
        if (active !== s) return;
        if (field.read() !== s.written) { cancel('Voice typing stopped because the text changed. Your edits were kept.'); return; }
        const interim = [];
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0] && String(result[0].transcript || '').trim();
          if (result.isFinal) s.parts[i] = transcript;
          else if (transcript) interim.push(transcript);
        }
        // Result indexes, not matching words, prevent replayed results duplicating text.
        const spoken = s.parts.filter(Boolean).join(' ');
        s.written = appendSpeech(s.base, spoken);
        field.write(s.written);
        s.interim = interim.join(' ');
        update(s);
      };
      rec.onerror = function (event) {
        retire(s, errors[event.error] || 'Voice typing could not finish. Review your words, or use keyboard dictation.', true);
      };
      rec.onend = function () {
        const message = s.endMessage || (s.written !== s.base
          ? 'Your words are ready to review. Edit them, then press the save button to create your Waymark.'
          : 'No words were added. Select the microphone again and wait for “Listening”, or use keyboard dictation.');
        retire(s, message, false);
      };
      s.startTimer = later(() => retire(s, 'The microphone did not become ready. Check permission, or use keyboard dictation.', true), 15000);
      s.timers.push(s.startTimer);
      s.timers.push(later(() => finish('Paused after two minutes. Review your words, then select the microphone again to continue.'), 120000));
      try { rec.start(); }
      catch (error) { retire(s, 'The microphone could not start. Try again, or use keyboard dictation.', true); return false; }
      return active === s;
    }

    return {
      start, finish, cancel,
      current: () => active,
      canSave: function (id) {
        if (!active || active.field.id !== id) return true;
        finish();
        return false;
      },
      undo: function (field) {
        if (active) return false;
        const prior = undo.get(field.id);
        if (!prior) return false;
        if (field.read() !== prior.after) { status(field, 'You edited this text after speaking. Use normal text editing so your changes are not overwritten.'); return false; }
        field.write(prior.before);
        undo.delete(field.id);
        status(field, 'Last voice entry undone. Your earlier words were kept.');
        return true;
      },
      hasUndo: field => undo.has(field.id)
    };
  }

  function mount(root) {
    const document = root.document;
    const containers = Array.from(document.querySelectorAll('[data-waymark-voice]'));
    if (!containers.length) return;
    const Recognition = root.SpeechRecognition || root.webkitSpeechRecognition;
    const secure = root.isSecureContext !== false && root.location.protocol !== 'file:';
    const supported = !!Recognition && secure;
    const consentKey = '9012_waymark_voice_consent_v1';
    let consent = false;
    try { consent = root.localStorage.getItem(consentKey) === 'yes'; } catch (error) {}
    const groups = [];
    const controller = createController({
      Recognition,
      lang: document.documentElement.lang === 'en' ? 'en-US' : (document.documentElement.lang || 'en-US'),
      onStatus: (field, message) => { field.status.hidden = false; field.status.textContent = message; },
      onState: function (state) {
        const field = state.field;
        if (state.message) { field.status.hidden = false; field.status.textContent = state.message; }
        field.interim.textContent = state.interim ? 'Hearing: ' + state.interim : '';
        field.interim.hidden = !state.interim;
        field.container.classList.toggle('is-listening', state.phase === 'listening');
        field.target.setAttribute('aria-busy', String(state.phase !== 'idle'));
        for (const g of groups) {
          const busy = controller.current();
          const other = busy && busy.field !== g;
          const finishing = busy && busy.phase === 'finishing';
          g.hold.disabled = !supported || !!other || !!finishing;
          g.hold.setAttribute('aria-pressed', String(!!busy && busy.field === g));
          g.hold.textContent = busy && busy.field === g ? (finishing ? 'Finishing…' : (busy.phase === 'starting' ? 'Connecting…' : '■ Stop')) : '🎙';
          g.hold.setAttribute('aria-label',busy && busy.field === g ? 'Stop dictation' : 'Dictate this Waymark');
          g.hold.title=busy && busy.field === g ? 'Stop dictation' : 'Dictate';
          g.undo.disabled = !!busy;
          g.undo.hidden = !controller.hasUndo(g);
        }
      }
    });

    function begin(g, mode) {
      if (!supported) return false;
      if (!consent) {
        g.privacy.hidden = false;
        g.enable.focus();
        g.status.textContent = 'Please read the speech-processing notice first. The microphone is off.';
        return false;
      }
      // The older prayer microphone shares the browser speech service.
      if (root._rec && root._recOn) {
        root._rec.onresult = root._rec.onerror = root._rec.onend = null;
        try { root._rec.abort(); } catch (error) {}
        root._recOn = false;
        const prayerMic = document.getElementById('pageMic');
        if (prayerMic) prayerMic.classList.remove('rec');
      }
      return controller.start(g, mode);
    }

    for (const container of containers) {
      const target = document.getElementById(container.getAttribute('data-waymark-voice'));
      const save = document.getElementById(container.getAttribute('data-voice-save'));
      if (!target || !save) continue;
      const statusId = target.id + '-voice-status';
      container.innerHTML = '<div class="voice-actions"><button type="button" class="voice-hold" aria-label="Dictate this Waymark" aria-pressed="false" title="Dictate">🎙</button></div>' +
        '<p class="voice-status" id="' + statusId + '" role="status" aria-live="polite" aria-atomic="true" hidden></p>' +
        '<p class="voice-interim" hidden></p>' +
        '<div class="voice-privacy" hidden><p><strong>Before using voice typing</strong></p><p>Your browser or its speech provider may process your audio online. 90:12 does not save an audio recording. Only the text you choose to save becomes a Waymark.</p><p>Use typing instead if you do not want speech processing.</p><button type="button" class="voice-enable">I agree — enable voice typing</button><button type="button" class="ghost voice-decline">Use typing instead</button></div>' +
        '<div class="voice-tools"><button type="button" class="ghost mini voice-undo" hidden>Undo last voice entry</button></div>';
      const find = name => container.querySelector('.voice-' + name);
      const g = {
        id: target.id, container, target, save,
        hold: find('hold'), status: find('status'), interim: find('interim'),
        privacy: find('privacy'), enable: find('enable'), undo: find('undo'),
        read: () => target.value,
        editable: () => !target.readOnly && !target.disabled && !save.disabled,
        write: value => { if (target.value !== value) { target.value = value; target.dispatchEvent(new root.Event('input', { bubbles: true })); } },
        lock: function (on) {
          if (on) { g.wasReadOnly = target.readOnly; g.wasDisabled = save.disabled; target.readOnly = true; save.disabled = true; }
          else { target.readOnly = g.wasReadOnly; save.disabled = g.wasDisabled; }
        }
      };
      groups.push(g);
      g.hold.setAttribute('aria-describedby', statusId);
      g.hold.setAttribute('aria-controls', target.id);
      if (!supported) {
        g.hold.disabled = true;
        g.status.hidden = false;
        g.status.textContent = secure ? 'This browser does not offer voice typing here. Use your keyboard’s microphone, if available, or type your memory.' : 'Open the published HTTPS website to use this microphone, or use keyboard dictation.';
      }
      g.enable.addEventListener('click', function () {
        consent = true;
        try { root.localStorage.setItem(consentKey, 'yes'); } catch (error) {}
        groups.forEach(field => { field.privacy.hidden = true; });
        g.status.hidden = false;
        g.status.textContent = 'Voice typing enabled. Select the microphone again, allow access if asked, and wait for “Listening”.';
        g.hold.focus();
      });
      find('decline').addEventListener('click', function () { g.privacy.hidden = true; target.focus(); g.status.hidden = false; g.status.textContent = 'The microphone is off. You can type your memory.'; });
      g.hold.addEventListener('click', function () {
        const s = controller.current();
        if (s && s.field === g) controller.finish(); else begin(g, 'tap');
      });
      g.undo.addEventListener('click', function () { if (controller.undo(g)) g.undo.hidden = true; });
    }

    root.addEventListener('keydown', function (event) { if (event.key === 'Escape' && controller.current()) { event.preventDefault(); controller.cancel(); } });
    root.addEventListener('blur', () => controller.cancel('Voice typing stopped when you left this window. Your words are still here.'));
    root.addEventListener('pagehide', () => controller.cancel());
    document.addEventListener('visibilitychange', function () { if (document.hidden) controller.cancel(); });
    root.app9012WaymarkVoice = Object.freeze({ canSave: controller.canSave, cancelAll: controller.cancel });
  }

  return { createController, appendSpeech, mount };
}));
