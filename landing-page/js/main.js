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

  // 2. Mobile Menu Toggle
  const menuToggle = document.getElementById('menu-toggle');
  const navLinks = document.getElementById('nav-links');

  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', () => {
      navLinks.classList.toggle('active');
      const isExpanded = navLinks.classList.contains('active');
      menuToggle.setAttribute('aria-expanded', isExpanded);
    });

    // Close menu when clicking a link
    navLinks.querySelectorAll('.nav-link').forEach((link) => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('active');
      });
    });
  }

  // 3. QR Code Modal Handling
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

  // Close modal on Escape key
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && qrModal?.classList.contains('active')) {
      closeModal();
    }
  });

  // 4. APK Download Trigger Feedback
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

  // 5. Scroll-Driven Reveal Animations (IntersectionObserver for 60FPS)
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

  // 6. Interactive 3D Subtle Parallax on Hero Phone
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
