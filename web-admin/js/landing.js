/**
 * ThreatTrack Landing Page Client Logic
 * Handles interactive QR modal, mobile drawer, smooth navigation, and UI interactions.
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Navigation scroll state & Futuristic Laser Progress Bar
  const header = document.querySelector('.site-header');
  const scrollProgressBar = document.getElementById('scroll-progress');
  const phoneWrapper = document.querySelector('.phone-wrapper');
  const heroFeaturesWrapper = document.getElementById('hero-features-wrapper');

  const handleScroll = () => {
    const scrollY = window.scrollY;

    // Header frosted transformation
    if (scrollY > 20) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }

    // Dynamic laser scroll progress bar
    if (scrollProgressBar) {
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight > 0) {
        const progress = Math.min(100, Math.max(0, (scrollY / docHeight) * 100));
        scrollProgressBar.style.width = `${progress}%`;
      }
    }

    // Scroll-driven background glow interpolation (smooth color transition)
    if (heroFeaturesWrapper) {
      const wrapperHeight = heroFeaturesWrapper.offsetHeight;
      if (wrapperHeight > 0) {
        const transitionProgress = Math.min(1, Math.max(0, scrollY / (wrapperHeight * 0.45)));
        const glowY = Math.min(85, 22 + transitionProgress * 65);
        const glowOpacity = Math.max(0, 0.42 - transitionProgress * 0.38);
        const glowPink = Math.max(0, 0.28 - transitionProgress * 0.22);

        heroFeaturesWrapper.style.setProperty('--glow-y', `${glowY.toFixed(1)}%`);
        heroFeaturesWrapper.style.setProperty('--glow-opacity', glowOpacity.toFixed(3));
        heroFeaturesWrapper.style.setProperty('--glow-pink', glowPink.toFixed(3));
      }
    }

    // Subtle scroll parallax on hero phone wrapper (smooth depth effect on desktop)
    if (phoneWrapper && window.innerWidth > 1024 && scrollY < 900) {
      phoneWrapper.style.transform = `translateY(${scrollY * 0.12}px)`;
    }
  };
  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();

  // 2. Mobile Menu Toggle & Navigation Management
  const menuToggle = document.getElementById('menu-toggle');
  const navLinks = document.getElementById('nav-links');

  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', () => {
      navLinks.classList.toggle('active');
      const isExpanded = navLinks.classList.contains('active');
      menuToggle.setAttribute('aria-expanded', isExpanded);
    });
  }

  // 3. Smooth In-Page Navigation with Header Offset & Clean URLs
  const navHeight = 76;
  const scrollOffset = navHeight + 24; // 100px breathing room below sticky header

  const scrollToTarget = (targetEl) => {
    if (!targetEl) return;
    const elementPosition = targetEl.getBoundingClientRect().top;
    const offsetPosition = elementPosition + window.pageYOffset - scrollOffset;

    window.scrollTo({
      top: Math.max(0, offsetPosition),
      behavior: 'smooth',
    });

    // Keep the address bar clean without '#hash'
    if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  };

  // Intercept all in-page anchor links (header nav and footer links)
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const targetId = anchor.getAttribute('href');
      if (!targetId || targetId === '#') {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        history.replaceState(null, '', window.location.pathname + window.location.search);
        return;
      }

      const targetEl = document.querySelector(targetId);
      if (targetEl) {
        e.preventDefault();
        scrollToTarget(targetEl);

        // Close mobile drawer if active
        if (navLinks) {
          navLinks.classList.remove('active');
          if (menuToggle) menuToggle.setAttribute('aria-expanded', 'false');
        }
      }
    });
  });

  // Clean initial hash on load if user arrived via a #hash URL
  if (window.location.hash) {
    const initialTarget = document.querySelector(window.location.hash);
    if (initialTarget) {
      setTimeout(() => {
        scrollToTarget(initialTarget);
      }, 150);
    } else {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }

  // 4. Active Nav-Link Scroll Spy
  const trackedNavSections = [
    { id: '#features', el: document.querySelector('#features') },
    { id: '#heatmap', el: document.querySelector('#heatmap') },
    { id: '#reporting', el: document.querySelector('#reporting') },
    { id: '#install-guide', el: document.querySelector('#install-guide') },
  ].filter((s) => s.el !== null);

  const updateActiveNavLink = () => {
    const scrollPos = window.scrollY + scrollOffset + 40;
    let currentId = '';

    for (let i = trackedNavSections.length - 1; i >= 0; i--) {
      const section = trackedNavSections[i];
      if (section.el.offsetTop <= scrollPos) {
        currentId = section.id;
        break;
      }
    }

    document.querySelectorAll('.nav-link').forEach((link) => {
      if (link.getAttribute('href') === currentId) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  };

  window.addEventListener('scroll', updateActiveNavLink, { passive: true });
  updateActiveNavLink();

  // 5. Floating Back to Top Button
  const backToTopBtn = document.getElementById('back-to-top');
  if (backToTopBtn) {
    window.addEventListener(
      'scroll',
      () => {
        if (window.scrollY > 350) {
          backToTopBtn.classList.add('is-visible');
        } else {
          backToTopBtn.classList.remove('is-visible');
        }
      },
      { passive: true }
    );

    backToTopBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (window.location.hash) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    });
  }

  // 6. QR Code Modal Handling
  const qrModal = document.getElementById('qr-modal');
  const openQrBtns = document.querySelectorAll('.open-qr-modal');
  const closeQrBtn = document.getElementById('close-qr-modal');

  const openModal = () => {
    if (qrModal) {
      qrModal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  };

  const closeModal = () => {
    if (qrModal) {
      qrModal.classList.remove('active');
      document.body.style.overflow = '';
    }
  };

  openQrBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openModal();
    });
  });

  if (closeQrBtn) {
    closeQrBtn.addEventListener('click', closeModal);
  }

  // Close modal when clicking on the backdrop
  if (qrModal) {
    qrModal.addEventListener('click', (e) => {
      if (e.target === qrModal) {
        closeModal();
      }
    });
  }

  // 7. Message Us (Feedback & Concerns) Modal Handling
  const feedbackModal = document.getElementById('feedback-modal');
  const openFeedbackBtns = document.querySelectorAll('.open-feedback-modal');
  const closeFeedbackBtn = document.getElementById('close-feedback-modal');
  const feedbackForm = document.getElementById('feedback-form');
  const feedbackSuccess = document.getElementById('feedback-success');
  const closeFeedbackSuccessBtn = document.getElementById('btn-close-feedback-success');

  const openFeedback = () => {
    if (feedbackModal) {
      feedbackModal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  };

  const closeFeedback = () => {
    if (feedbackModal) {
      feedbackModal.classList.remove('active');
      document.body.style.overflow = '';
      setTimeout(() => {
        if (feedbackForm) feedbackForm.style.display = 'flex';
        if (feedbackSuccess) feedbackSuccess.style.display = 'none';
      }, 300);
    }
  };

  openFeedbackBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openFeedback();
    });
  });

  if (closeFeedbackBtn) closeFeedbackBtn.addEventListener('click', closeFeedback);
  if (closeFeedbackSuccessBtn) closeFeedbackSuccessBtn.addEventListener('click', closeFeedback);

  if (feedbackModal) {
    feedbackModal.addEventListener('click', (e) => {
      if (e.target === feedbackModal) {
        closeFeedback();
      }
    });
  }

  // 7b. Admin Portal Access Confirmation Modal Handling
  const adminModal = document.getElementById('admin-auth-modal');
  const openAdminBtns = document.querySelectorAll('.open-admin-modal');
  const closeAdminBtn = document.getElementById('close-admin-modal');
  const cancelAdminBtn = document.getElementById('btn-cancel-admin');

  const openAdminConfirmModal = () => {
    if (adminModal) {
      adminModal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  };

  const closeAdminConfirmModal = () => {
    if (adminModal) {
      adminModal.classList.remove('active');
      document.body.style.overflow = '';
    }
  };

  openAdminBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openAdminConfirmModal();
    });
  });

  if (closeAdminBtn) closeAdminBtn.addEventListener('click', closeAdminConfirmModal);
  if (cancelAdminBtn) cancelAdminBtn.addEventListener('click', closeAdminConfirmModal);

  if (adminModal) {
    adminModal.addEventListener('click', (e) => {
      if (e.target === adminModal) {
        closeAdminConfirmModal();
      }
    });
  }

  // Close modals on Escape key
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (qrModal?.classList.contains('active')) closeModal();
      if (feedbackModal?.classList.contains('active')) closeFeedback();
      if (adminModal?.classList.contains('active')) closeAdminConfirmModal();
    }
  });

  // Handle Feedback Form Submission
  if (feedbackForm) {
    feedbackForm.addEventListener('submit', (e) => {
      e.preventDefault();
      feedbackForm.style.display = 'none';
      if (feedbackSuccess) feedbackSuccess.style.display = 'block';
      feedbackForm.reset();
    });
  }

  // 8. APK Download Trigger Feedback
  const downloadBtns = document.querySelectorAll('.download-apk-btn');
  downloadBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      // If no physical APK file exists yet, give friendly feedback
      const href = btn.getAttribute('href');
      if (!href || href === '#' || href === '') {
        e.preventDefault();
        alert('ThreatTrack Mobile v1.0.0 (Android APK) will download once built. You can also scan the QR code to install.');
      }
    });
  });

  // 9. Scroll-Driven Reveal Animations (IntersectionObserver for 60FPS)
  const revealElements = document.querySelectorAll('.reveal-on-scroll');
  if ('IntersectionObserver' in window) {
    const observerOptions = {
      root: null,
      rootMargin: '0px 0px -50px 0px', // Trigger slightly before entering bottom
      threshold: 0.1,
    };

    const scrollObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target); // Animates once cleanly
        }
      });
    }, observerOptions);

    revealElements.forEach((el) => {
      scrollObserver.observe(el);
    });
  } else {
    // Fallback for older browsers without IntersectionObserver
    revealElements.forEach((el) => el.classList.add('is-visible'));
  }

  // 10. Interactive 3D Subtle Parallax on Hero Phone
  const phoneChassis = document.querySelector('.phone-chassis');
  const heroSection = document.querySelector('.hero-section');

  if (phoneChassis && heroSection && window.innerWidth > 1024) {
    heroSection.addEventListener('mousemove', (e) => {
      const rect = heroSection.getBoundingClientRect();
      const x = (e.clientX - rect.left - rect.width / 2) / (rect.width / 2);
      const y = (e.clientY - rect.top - rect.height / 2) / (rect.height / 2);

      // Subtle tilt delta around resting angle (10deg Y, -3deg counter-clockwise tilt)
      const tiltY = 10 + x * 3.0;
      const tiltX = 0 - y * 2.5;
      const tiltZ = -3 + x * 1.2;

      phoneChassis.style.transform = `rotateY(${tiltY.toFixed(2)}deg) rotateX(${tiltX.toFixed(2)}deg) rotate(${tiltZ.toFixed(2)}deg) translateZ(10px)`;
    });

    heroSection.addEventListener('mouseleave', () => {
      phoneChassis.style.transform = '';
    });
  }
});
