(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // 1. Routing Filter Controls
  // ---------------------------------------------------------------------------
  const filterButtons = document.querySelectorAll('.filter-btn');
  const routingRows = document.querySelectorAll('#routing-tbody tr');

  filterButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.filter;
      filterButtons.forEach((b) => {
        const active = b === btn;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
      });

      routingRows.forEach((row) => {
        const match = target === 'all' || row.dataset.category === target;
        row.hidden = !match;
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Inquiry Context Prefill (from Routing Table & Directory Cards)
  // ---------------------------------------------------------------------------
  const inquirySection = document.getElementById('inquiries');
  const briefField = document.getElementById('brief');

  const selectInquiryType = (typeValue) => {
    const radio = document.querySelector(`input[name="inquiry_type"][value="${typeValue}"]`);
    if (radio) radio.checked = true;
  };

  document.querySelectorAll('.table-action-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const context = btn.dataset.inquiryContext;
      if (context && briefField) {
        briefField.value = `Reference: ${context}\n\n`;
      }
      selectInquiryType(context?.toLowerCase().includes('press') ? 'press' : 'booking');
      inquirySection?.scrollIntoView({ behavior: 'smooth' });
      briefField?.focus();
    });
  });

  document.querySelectorAll('.meet-request-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const context = btn.dataset.meetContext;
      if (context && briefField) {
        briefField.value = `Reference: ${context}\nNumber of guests:\nPreferred date:\n\n`;
      }
      selectInquiryType('meet');
      inquirySection?.scrollIntoView({ behavior: 'smooth' });
      briefField?.focus();
    });
  });

  document.querySelectorAll('[data-prefill-type]').forEach((link) => {
    link.addEventListener('click', () => {
      const type = link.dataset.prefillType;
      if (type) selectInquiryType(type);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Native <dialog> Modal + Light-Dismiss Fallback
  // ---------------------------------------------------------------------------
  const epkDialog = document.getElementById('epk-dialog');
  const openEpkButtons = [
    document.getElementById('open-epk-btn'),
    document.getElementById('hero-epk-btn'),
    document.getElementById('footer-epk-btn'),
    document.getElementById('mobile-epk-btn')
  ].filter(Boolean);

  // Close mobile popover when a nav link inside it is clicked
  const mobileNav = document.getElementById('mobile-nav');
  if (mobileNav) {
    mobileNav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        if (mobileNav.matches(':popover-open')) {
          mobileNav.hidePopover();
        }
      });
    });
  }
  const closeEpkBtn = document.getElementById('close-epk-btn');

  if (epkDialog) {
    openEpkButtons.forEach((btn) => {
      btn.addEventListener('click', () => epkDialog.showModal());
    });

    closeEpkBtn?.addEventListener('click', () => epkDialog.close('close'));

    // Fallback for browsers without native closedby="any" support
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      let pressedOutside = false;
      const isOutside = (e) => {
        const r = epkDialog.getBoundingClientRect();
        return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      };
      epkDialog.addEventListener('pointerdown', (e) => {
        pressedOutside = isOutside(e);
      });
      epkDialog.addEventListener('pointerup', (e) => {
        if (pressedOutside && isOutside(e)) epkDialog.close('dismiss');
      });
    }

    epkDialog.addEventListener('close', () => {
      const action = epkDialog.returnValue;
      epkDialog.returnValue = '';
      if (action === 'request') {
        selectInquiryType('press');
        if (briefField && !briefField.value.trim()) {
          briefField.value = 'Requesting 2026/2027 Production Pack & High-Resolution Press Kit.\n\n';
        }
        inquirySection?.scrollIntoView({ behavior: 'smooth' });
        document.getElementById('full-name')?.focus();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 4. Accessible Form Validation (:user-invalid + ARIA sync + fallback)
  // ---------------------------------------------------------------------------
  const form = document.getElementById('management-form');
  const formStatus = document.getElementById('form-status');

  if (form) {
    const announcer = document.createElement('div');
    announcer.setAttribute('aria-live', 'polite');
    announcer.classList.add('visually-hidden');
    document.body.append(announcer);

    let announceTimer;
    let announcedField;

    const linkError = (el, shown) => {
      const errorId = el.dataset.error;
      if (!errorId) return;
      const ids = (el.getAttribute('aria-describedby') || '')
        .split(/\s+/)
        .filter((id) => id && id !== errorId);
      if (shown) ids.push(errorId);
      if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
      else el.removeAttribute('aria-describedby');
    };

    const spokenText = (node) => {
      const copy = node.cloneNode(true);
      copy.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
      copy.querySelectorAll('[role="img"][aria-label]').forEach((n) =>
        n.replaceWith(`${n.getAttribute('aria-label')}: `)
      );
      return copy.textContent.replace(/\s+/g, ' ').trim();
    };

    const announceError = (el) => {
      const error = document.getElementById(el.dataset.error);
      if (!error) return;
      const label = el.labels?.[0] ? `${spokenText(el.labels[0])}: ` : '';
      clearTimeout(announceTimer);
      announcer.textContent = '';
      announcedField = el;
      announceTimer = setTimeout(() => {
        announcer.textContent = label + spokenText(error);
      }, 500);
    };

    const supportsUserInvalid = CSS.supports('selector(:user-invalid)');
    const dirtyState = new WeakMap();
    const flagged = new WeakSet();
    const announced = new WeakSet();

    const syncAria = (el, announce = false, forceCheck = false) => {
      if (!el.matches?.('input, select, textarea')) return;

      let invalid = false;
      if (supportsUserInvalid) {
        invalid = el.matches(':user-invalid');
      } else if (forceCheck) {
        invalid = !el.validity.valid;
        el.classList.toggle('user-invalid-fallback', invalid);
        el.classList.toggle('user-valid-fallback', !invalid);
      }

      if (invalid) {
        if (announce && !announced.has(el)) {
          announceError(el);
          announced.add(el);
        }
        el.setAttribute('aria-invalid', 'true');
        linkError(el, true);
        flagged.add(el);
      } else if (flagged.has(el) || el.getAttribute('aria-invalid') !== 'true') {
        el.setAttribute('aria-invalid', 'false');
        linkError(el, false);
        flagged.delete(el);
        announced.delete(el);
        if (announcedField === el) {
          clearTimeout(announceTimer);
          announcer.textContent = '';
        }
      }
    };

    form.querySelectorAll('input, select, textarea').forEach((el) => syncAria(el));

    form.addEventListener('blur', (e) => {
      const state = dirtyState.get(e.target) || { hasInteracted: false, hasBlurred: false };
      state.hasBlurred = true;
      dirtyState.set(e.target, state);
      syncAria(e.target, true, state.hasInteracted);
    }, true);

    form.addEventListener('input', (e) => {
      const state = dirtyState.get(e.target) || { hasInteracted: false, hasBlurred: false };
      state.hasInteracted = true;
      dirtyState.set(e.target, state);
      if (e.target.hasAttribute('aria-invalid')) {
        syncAria(e.target, false, state.hasBlurred);
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const controls = [...form.querySelectorAll('input, select, textarea')];
      let firstInvalid = null;

      controls.forEach((el) => {
        if (!el.validity.valid) {
          if (!firstInvalid) firstInvalid = el;
          dirtyState.set(el, { hasInteracted: true, hasBlurred: true });
          announced.add(el);
          el.classList.add('user-invalid-fallback');
          syncAria(el, false, true);
        }
      });

      if (firstInvalid) {
        firstInvalid.focus();
        return;
      }

      const submitBtn = document.getElementById('submit-inquiry-btn');
      const originalLabel = submitBtn?.textContent || 'Transmit to Management Desk';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Transmitting…';
      }

      const data = new FormData(form);
      const payload = {
        inquiry_type: data.get('inquiry_type') || 'booking',
        full_name: data.get('full_name') || '',
        organization: data.get('organization') || '',
        email: data.get('email') || '',
        territory: data.get('territory') || '',
        brief: data.get('brief') || ''
      };

      try {
        const res = await fetch('/api/inquiry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (!res.ok || !result.ok) {
          throw new Error(result.error || 'Unable to transmit inquiry.');
        }

        if (formStatus) {
          formStatus.hidden = false;
          formStatus.classList.remove('is-error');
          formStatus.textContent = `Inquiry ${result.refCode} received. Our management desk will review your brief and respond within 48 business hours.`;
        }

        form.reset();
        controls.forEach((el) => {
          dirtyState.delete(el);
          el.classList.remove('user-invalid-fallback', 'user-valid-fallback');
          syncAria(el);
        });
      } catch (err) {
        if (formStatus) {
          formStatus.hidden = false;
          formStatus.classList.add('is-error');
          formStatus.textContent = `Transmission failed: ${err.message}. Ensure the site is running via "node server.js".`;
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalLabel;
        }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 4b. Floating Quick-Support Popover
  // ---------------------------------------------------------------------------
  const supportFab = document.getElementById('support-fab');
  const supportPopover = document.getElementById('support-popover');
  const supportCloseBtn = document.getElementById('support-close-btn');
  const supportThread = document.getElementById('support-thread');
  const supportForm = document.getElementById('support-form');
  const supportMessageEl = document.getElementById('support-message');
  const renderedMsgIds = new Set();

  const appendDmBubble = (text, meta, kind = 'in', id = null) => {
    if (!supportThread) return;
    if (id && renderedMsgIds.has(id)) return;
    if (id) renderedMsgIds.add(id);

    const bubble = document.createElement('div');
    bubble.className = `dm-bubble dm-bubble-${kind}`;
    const p = document.createElement('p');
    p.textContent = text;
    const span = document.createElement('span');
    span.className = 'dm-time';
    span.textContent = meta;
    bubble.append(p, span);
    supportThread.append(bubble);
    supportThread.scrollTop = supportThread.scrollHeight;
  };

  if (supportPopover) {
    let supportsDisplayTransition;
    const canTransitionDisplay = () => {
      if (supportsDisplayTransition !== undefined) return supportsDisplayTransition;
      if (!window.CSS?.supports?.('transition-behavior', 'allow-discrete') || !document.body) {
        return false;
      }
      const probe = document.createElement('div');
      probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
      document.body.appendChild(probe);
      getComputedStyle(probe).display;
      probe.style.display = 'none';
      supportsDisplayTransition = getComputedStyle(probe).display === 'block';
      probe.remove();
      return supportsDisplayTransition;
    };

    const supportsTopLayerExit = () =>
      window.CSS?.supports?.('overlay', 'auto') && canTransitionDisplay();

    const closeSupportPopover = async () => {
      if (!supportsTopLayerExit()) {
        supportPopover.setAttribute('data-closing', '');
        const animations = supportPopover.getAnimations({ subtree: true });
        if (animations.length > 0) {
          await Promise.race([
            Promise.allSettled(animations.map((a) => a.finished)),
            new Promise((r) => setTimeout(r, 500))
          ]);
        }
        if (!supportPopover.hasAttribute('data-closing')) return;
        supportPopover.removeAttribute('data-closing');
      }
      supportPopover.hidePopover?.();
      supportFab?.focus();
    };

    supportCloseBtn?.addEventListener('click', (e) => {
      if (!supportsTopLayerExit()) {
        e.preventDefault();
        closeSupportPopover();
      }
    });

    let pollTimer = null;

    const getSupportSessionId = () => {
      let id = localStorage.getItem('dg_support_session');
      if (!id || !/^SUP-[A-Z0-9]{4,12}$/i.test(id)) {
        id = `SUP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
        localStorage.setItem('dg_support_session', id);
      }
      return id;
    };

    const syncSupportMessages = async () => {
      try {
        const sessionId = getSupportSessionId();
        const res = await fetch(`/api/support?sessionId=${encodeURIComponent(sessionId)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data.ok || !Array.isArray(data.messages)) return;
        for (const m of data.messages) {
          const kind = m.sender === 'visitor' ? 'out' : 'in';
          const label = m.sender === 'visitor' ? `You · ${m.time}` : `Support Desk · ${m.time}`;
          appendDmBubble(m.text, label, kind, m.id);
        }
      } catch {
        // Ignore transient poll errors
      }
    };

    const startPolling = () => {
      syncSupportMessages();
      if (!pollTimer) {
        pollTimer = setInterval(syncSupportMessages, 2500);
      }
    };

    const stopPolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    supportPopover.addEventListener('toggle', (e) => {
      const isOpen = e.newState === 'open';
      supportFab?.setAttribute('aria-expanded', String(isOpen));
      if (isOpen) {
        supportPopover.removeAttribute('data-closing');
        startPolling();
        supportMessageEl?.focus();
      } else {
        stopPolling();
        if (supportPopover.contains(document.activeElement)) {
          supportFab?.focus();
        }
      }
    });
  }

  if (supportForm) {
    const supportsUserInvalid = CSS.supports('selector(:user-invalid)');
    const supportDirty = new WeakMap();

    const syncSupportField = (el, forceCheck = false) => {
      if (!el.matches?.('input, textarea')) return;
      const invalid = supportsUserInvalid
        ? el.matches(':user-invalid')
        : forceCheck && !el.validity.valid;

      if (!supportsUserInvalid && forceCheck) {
        el.classList.toggle('user-invalid-fallback', invalid);
        el.classList.toggle('user-valid-fallback', !invalid);
      }

      el.setAttribute('aria-invalid', invalid ? 'true' : 'false');
      const errorId = el.dataset.error;
      if (errorId) {
        const ids = (el.getAttribute('aria-describedby') || '')
          .split(/\s+/)
          .filter((id) => id && id !== errorId);
        if (invalid) ids.push(errorId);
        if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
        else el.removeAttribute('aria-describedby');
      }
    };

    supportForm.querySelectorAll('textarea').forEach((el) => syncSupportField(el));

    supportForm.addEventListener('blur', (e) => {
      const state = supportDirty.get(e.target) || { hasInteracted: false, hasBlurred: false };
      state.hasBlurred = true;
      supportDirty.set(e.target, state);
      syncSupportField(e.target, state.hasInteracted);
    }, true);

    supportForm.addEventListener('input', (e) => {
      const state = supportDirty.get(e.target) || { hasInteracted: false, hasBlurred: false };
      state.hasInteracted = true;
      supportDirty.set(e.target, state);
      if (e.target.hasAttribute('aria-invalid')) {
        syncSupportField(e.target, state.hasBlurred);
      }
    });

    supportMessageEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        supportForm.requestSubmit();
      }
    });

    supportForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (supportMessageEl && !supportMessageEl.value.trim()) {
        supportDirty.set(supportMessageEl, { hasInteracted: true, hasBlurred: true });
        supportMessageEl.classList.add('user-invalid-fallback');
        syncSupportField(supportMessageEl, true);
        supportMessageEl.focus();
        return;
      }

      const submitBtn = document.getElementById('support-submit-btn');
      if (submitBtn) submitBtn.disabled = true;

      const message = String(supportMessageEl?.value || '').trim();
      const sessionId = (() => {
        let id = localStorage.getItem('dg_support_session');
        if (!id || !/^SUP-[A-Z0-9]{4,12}$/i.test(id)) {
          id = `SUP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
          localStorage.setItem('dg_support_session', id);
        }
        return id;
      })();

      if (supportMessageEl) {
        supportMessageEl.value = '';
        supportDirty.delete(supportMessageEl);
        supportMessageEl.classList.remove('user-invalid-fallback', 'user-valid-fallback');
        syncSupportField(supportMessageEl);
      }

      try {
        const res = await fetch('/api/support', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            message,
            page: window.location.pathname + window.location.hash
          })
        });
        const result = await res.json();
        if (!res.ok || !result.ok) {
          throw new Error(result.error || 'Unable to send support message.');
        }

        if (Array.isArray(result.messages)) {
          const latest = result.messages[result.messages.length - 1];
          if (latest) {
            appendDmBubble(latest.text, `You · ${latest.time}`, 'out', latest.id);
          }
        }
      } catch (err) {
        appendDmBubble(`Failed to send: ${err.message}`, 'Support Desk', 'error');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
        supportMessageEl?.focus();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 5. Visitor Notification (once per session once relayed, rich telemetry)
  // ---------------------------------------------------------------------------
  if (!sessionStorage.getItem('dg_visit_notified')) {
    const params = new URLSearchParams(window.location.search);
    const utms = ['utm_source', 'utm_medium', 'utm_campaign']
      .map((k) => (params.get(k) ? `${k.replace('utm_', '')}=${params.get(k)}` : null))
      .filter(Boolean)
      .join(' · ');

    const width = window.innerWidth;
    const deviceType = width < 640 ? 'Mobile' : width < 1024 ? 'Tablet' : 'Desktop';

    const visitPayload = JSON.stringify({
      path: window.location.pathname + window.location.hash,
      referrer: document.referrer || 'Direct',
      utm: utms || 'None',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown',
      localTime: new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }),
      language: navigator.language || 'Unknown',
      device: `${deviceType} (${window.innerWidth}×${window.innerHeight}, ${window.devicePixelRatio || 1}x DPR)`,
      screen: `${window.screen.width}×${window.screen.height}`,
      connection: navigator.connection?.effectiveType || 'Unknown'
    });

    fetch('/api/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: visitPayload,
      keepalive: true
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.relayed) {
          sessionStorage.setItem('dg_visit_notified', '1');
        }
      })
      .catch(() => {});
  }

  // ---------------------------------------------------------------------------
  // 6. GSAP + ScrollTrigger Choreography (Reduced-Motion Safe)
  // ---------------------------------------------------------------------------
  if (typeof window.gsap !== 'undefined') {
    const { gsap, ScrollTrigger } = window;
    if (ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      // Hero staggered entrance
      const heroTl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      heroTl
        .from('.hero-top-meta', { y: -12, opacity: 0, duration: 0.6, clearProps: 'transform,opacity' })
        .from('.hero-anim', { y: 28, opacity: 0, duration: 0.85, stagger: 0.1, clearProps: 'transform,opacity' }, '-=0.35')
        .fromTo(
          '.hero-anim-media',
          { clipPath: 'inset(0% 0% 100% 0%)', opacity: 0 },
          {
            clipPath: 'inset(0% 0% 0% 0%)',
            opacity: 1,
            duration: 1.05,
            ease: 'power4.out',
            clearProps: 'clipPath,opacity'
          },
          '-=0.75'
        )
        .from('.hero-portrait-img', { scale: 1.1, duration: 1.25, ease: 'power3.out', clearProps: 'transform' }, '<');

      if (ScrollTrigger) {
        // Subtle parallax on hero portrait as user scrolls
        gsap.to('.hero-portrait-frame', {
          y: -36,
          ease: 'none',
          scrollTrigger: {
            trigger: '.hero',
            start: 'top top',
            end: 'bottom top',
            scrub: 0.6
          }
        });

        // Staggered grid card reveals
        ['.scope-grid', '.meet-grid', '.directory-grid'].forEach((gridSelector) => {
          const cards = document.querySelectorAll(`${gridSelector} .reveal-item`);
          if (!cards.length) return;
          gsap.from(cards, {
            y: 26,
            opacity: 0,
            duration: 0.7,
            stagger: 0.09,
            ease: 'power2.out',
            clearProps: 'transform,opacity',
            scrollTrigger: {
              trigger: gridSelector,
              start: 'top 84%',
              once: true
            }
          });
        });

        // Routing table rows reveal
        gsap.from('#routing-tbody tr', {
          y: 16,
          opacity: 0,
          duration: 0.5,
          stagger: 0.05,
          ease: 'power2.out',
          clearProps: 'transform,opacity',
          scrollTrigger: {
            trigger: '.routing-table',
            start: 'top 85%',
            once: true
          }
        });
      }
    });
  }
})();
