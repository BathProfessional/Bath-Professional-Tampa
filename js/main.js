/* Bath Professional — Main JavaScript */

(function () {
  'use strict';

  gsap.registerPlugin(ScrollTrigger);

  // ─── Lenis Smooth Scroll (desktop only — script loaded only when needed) ───
  const useLenis = window.matchMedia('(pointer: fine)').matches && window.innerWidth >= 1024;
  let lenis = null;

  function startLenis() {
    if (!window.Lenis || lenis) return;
    lenis = new window.Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  if (useLenis) {
    if (window.Lenis) {
      startLenis();
    } else {
      const lenisScript = document.createElement('script');
      lenisScript.src = 'https://cdn.jsdelivr.net/npm/lenis@1.1.13/dist/lenis.min.js';
      lenisScript.async = true;
      lenisScript.onload = startLenis;
      document.head.appendChild(lenisScript);
    }
  }

  // ─── Header Scroll ───
  const header = document.getElementById('header');
  ScrollTrigger.create({
    start: 'top -80',
    onUpdate: (self) => header.classList.toggle('scrolled', self.scroll() > 80),
  });

  // ─── Mobile Menu ───
  const menuToggle = document.getElementById('menuToggle');
  const mobileMenu = document.getElementById('mobileMenu');

  menuToggle?.addEventListener('click', () => {
    const open = mobileMenu.classList.toggle('open');
    menuToggle.classList.toggle('active', open);
    document.body.classList.toggle('menu-open', open);
    mobileMenu.setAttribute('aria-hidden', !open);
  });

  document.querySelectorAll('.mobile-nav-link').forEach((link) => {
    link.addEventListener('click', () => {
      mobileMenu.classList.remove('open');
      menuToggle.classList.remove('active');
      document.body.classList.remove('menu-open');
    });
  });

  // ─── Smooth anchor links ───
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const href = anchor.getAttribute('href');
      if (!href || href === '#') return;
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        const offset = -80;
        if (lenis) {
          lenis.scrollTo(target, { offset });
        } else {
          const top = target.getBoundingClientRect().top + window.scrollY + offset;
          window.scrollTo({ top, behavior: 'smooth' });
        }
      }
    });
  });

  // ─── Hero Reveal Animation (force3D + softer stagger for smoother intro) ───
  gsap.to('.hero-badge.reveal-up, .hero-sub.reveal-up, .hero-ctas.reveal-up, .google-trust-panel.reveal-up', {
    opacity: 1,
    y: 0,
    duration: 0.9,
    stagger: 0.1,
    ease: 'power2.out',
    delay: 0.55,
    force3D: true,
  });

  gsap.fromTo('.hero-title-brand',
    { opacity: 0, y: 36, scale: 0.96 },
    { opacity: 1, y: 0, scale: 1, duration: 1, ease: 'power3.out', delay: 0.15, force3D: true }
  );

  gsap.fromTo('.hero-title-divider',
    { opacity: 0, scaleX: 0 },
    { opacity: 1, scaleX: 1, duration: 0.7, ease: 'power2.inOut', delay: 0.4, force3D: true }
  );

  gsap.fromTo('.hero-title-tagline',
    { opacity: 0, y: 18 },
    { opacity: 1, y: 0, duration: 0.85, ease: 'power2.out', delay: 0.5, force3D: true }
  );

  // ─── Hero sparkle FX ───
  const sparkleField = document.getElementById('heroSparkleField');
  const mouseSparkles = document.getElementById('heroMouseSparkles');
  const heroSection = document.getElementById('hero');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobileHero = window.matchMedia('(max-width: 768px), (hover: none)').matches;

  if (!reducedMotion) {
    if (sparkleField) {
      const colors = ['teal', 'gold', 'white'];
      // Fewer DOM sparkles = far less composite cost
      const count = isMobileHero ? 4 : 12;

      for (let i = 0; i < count; i++) {
        const el = document.createElement('span');
        const isDiamond = Math.random() > 0.7;
        el.className = `hero-sparkle ${colors[i % 3]}${isDiamond ? ' diamond' : ''}`;
        el.style.left = `${8 + Math.random() * 84}%`;
        el.style.top = `${8 + Math.random() * 84}%`;
        el.style.setProperty('--sz', `${2 + Math.random() * 4}px`);
        el.style.setProperty('--dur', `${2.8 + Math.random() * 3.5}s`);
        el.style.setProperty('--delay', `${Math.random() * 4}s`);
        sparkleField.appendChild(el);
      }
    }

    if (mouseSparkles && heroSection && window.matchMedia('(pointer: fine)').matches) {
      const sparkleColors = ['#5eead4', '#fbbf24', '#ffffff'];
      let lastSpawn = 0;
      let heroRect = null;
      let rectStale = true;

      const refreshRect = () => { rectStale = true; };
      window.addEventListener('resize', refreshRect, { passive: true });
      window.addEventListener('scroll', refreshRect, { passive: true });

      heroSection.addEventListener('mousemove', (e) => {
        const now = performance.now();
        // Throttle (~8 sparks/sec) for smoother main thread
        if (now - lastSpawn < 120) return;
        lastSpawn = now;

        if (rectStale || !heroRect) {
          heroRect = heroSection.getBoundingClientRect();
          rectStale = false;
        }

        const x = ((e.clientX - heroRect.left) / heroRect.width) * 100;
        const y = ((e.clientY - heroRect.top) / heroRect.height) * 100;

        const spark = document.createElement('span');
        spark.className = 'hero-mouse-sparkle';
        spark.style.left = `${x}%`;
        spark.style.top = `${y}%`;
        spark.style.setProperty('--sz', `${2.5 + Math.random() * 3}px`);
        spark.style.setProperty('--sparkle-color', sparkleColors[Math.floor(Math.random() * 3)]);
        mouseSparkles.appendChild(spark);

        if (mouseSparkles.children.length > 8) {
          mouseSparkles.firstElementChild?.remove();
        }
        spark.addEventListener('animationend', () => spark.remove(), { once: true });
      }, { passive: true });
    }
  }

  // ─── Particle Canvas (lightweight glow dots — desktop only) ───
  const canvas = document.getElementById('particleCanvas');
  if (canvas && !reducedMotion && !isMobileHero) {
    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    let particles = [];
    let w, h, dpr = 1;
    let mouseX = -1000;
    let mouseY = -1000;
    let running = true;
    let lastFrame = 0;
    let particleFrame = 0;
    let canvasRect = null;

    function resize() {
      const hero = document.getElementById('hero');
      const rect = hero?.getBoundingClientRect() || { width: window.innerWidth, height: window.innerHeight };
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = Math.floor(rect.width);
      h = Math.floor(rect.height);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles.forEach((particle) => particle.createSprite());
      canvasRect = null;
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });

    function startParticles() {
      if (running && !particleFrame) particleFrame = requestAnimationFrame(animateParticles);
    }

    function stopParticles() {
      if (particleFrame) cancelAnimationFrame(particleFrame);
      particleFrame = 0;
    }

    // Pause particles when hero is off-screen
    if ('IntersectionObserver' in window && heroSection) {
      const io = new IntersectionObserver(([entry]) => {
        running = entry.isIntersecting;
        if (running) startParticles();
        else stopParticles();
      }, { threshold: 0.05 });
      io.observe(heroSection);
    }

    document.getElementById('hero')?.addEventListener('mousemove', (e) => {
      if (!canvasRect) canvasRect = canvas.getBoundingClientRect();
      mouseX = e.clientX - canvasRect.left;
      mouseY = e.clientY - canvasRect.top;
    }, { passive: true });
    window.addEventListener('scroll', () => { canvasRect = null; }, { passive: true });

    // Cache each glow once instead of allocating a gradient for every dot, every frame.
    function createDotSprite(size, hue) {
      const radius = size * 2.2;
      const displaySize = Math.ceil(radius * 2 + 2);
      const sprite = document.createElement('canvas');
      sprite.width = Math.ceil(displaySize * dpr);
      sprite.height = Math.ceil(displaySize * dpr);
      const spriteCtx = sprite.getContext('2d', { alpha: true });
      spriteCtx.scale(dpr, dpr);
      const center = displaySize / 2;
      const gradient = spriteCtx.createRadialGradient(center, center, 0, center, center, radius);
      gradient.addColorStop(0, `hsla(${hue}, 90%, 75%, 1)`);
      gradient.addColorStop(0.45, `hsla(${hue}, 90%, 60%, 0.35)`);
      gradient.addColorStop(1, `hsla(${hue}, 90%, 60%, 0)`);
      spriteCtx.beginPath();
      spriteCtx.fillStyle = gradient;
      spriteCtx.arc(center, center, radius, 0, Math.PI * 2);
      spriteCtx.fill();
      return { image: sprite, size: displaySize };
    }

    class Particle {
      constructor() { this.reset(true); }
      reset(initial) {
        this.x = Math.random() * w;
        this.y = initial ? Math.random() * h : h + 10;
        this.size = Math.random() * 1.8 + 0.6;
        this.speedX = (Math.random() - 0.5) * 0.22;
        this.speedY = (Math.random() - 0.5) * 0.22 - 0.08;
        this.opacity = Math.random() * 0.45 + 0.12;
        this.hue = Math.random() > 0.45 ? 168 : 43;
        this.twinkle = Math.random() * Math.PI * 2;
        this.twinkleSpeed = 0.015 + Math.random() * 0.025;
        this.createSprite();
      }
      createSprite() {
        this.sprite = createDotSprite(this.size, this.hue);
      }
      update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.twinkle += this.twinkleSpeed;
        const tw = 0.55 + Math.sin(this.twinkle) * 0.45;
        this.currentOpacity = this.opacity * tw;

        const dx = mouseX - this.x;
        const dy = mouseY - this.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < 10000) {
          this.x -= dx * 0.006;
          this.y -= dy * 0.006;
          this.currentOpacity = Math.min(0.95, this.currentOpacity + 0.1);
        }

        if (this.x < -20 || this.x > w + 20 || this.y < -20 || this.y > h + 20) this.reset(false);
      }
      draw() {
        const offset = this.sprite.size / 2;
        ctx.globalAlpha = this.currentOpacity;
        ctx.drawImage(this.sprite.image, this.x - offset, this.y - offset, this.sprite.size, this.sprite.size);
        ctx.globalAlpha = 1;
      }
    }

    const particleCount = 24;
    for (let i = 0; i < particleCount; i++) particles.push(new Particle());

    function animateParticles(ts) {
      particleFrame = 0;
      if (!running || document.hidden) return;
      // Cap ~24fps — still looks smooth, lower main-thread cost
      if (ts - lastFrame < 41) {
        particleFrame = requestAnimationFrame(animateParticles);
        return;
      }
      lastFrame = ts;

      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < particles.length; i++) {
        particles[i].update();
        particles[i].draw();
      }
      particleFrame = requestAnimationFrame(animateParticles);
    }
    startParticles();
  }

  // ─── Section Scroll Animations (once: true = free after play) ───
  gsap.utils.toArray('.section-header').forEach((el) => {
    gsap.from(el.children, {
      scrollTrigger: { trigger: el, start: 'top 80%', once: true },
      opacity: 0,
      y: 40,
      duration: 0.8,
      stagger: 0.1,
      ease: 'power3.out',
      force3D: true,
    });
  });

  gsap.utils.toArray('.service-card').forEach((card, i) => {
    gsap.from(card, {
      scrollTrigger: { trigger: card, start: 'top 85%', once: true },
      opacity: 0,
      y: 60,
      duration: 0.7,
      delay: i * 0.1,
      ease: 'power3.out',
      force3D: true,
    });
  });

  gsap.utils.toArray('.why-card').forEach((card, i) => {
    gsap.from(card, {
      scrollTrigger: { trigger: card, start: 'top 85%', once: true },
      opacity: 0,
      y: 40,
      scale: 0.95,
      duration: 0.6,
      delay: i * 0.08,
      ease: 'back.out(1.2)',
      force3D: true,
    });
  });

  if (document.querySelector('.compare-wrap')) {
    gsap.from('.compare-wrap', {
      scrollTrigger: { trigger: '.compare-wrap', start: 'top 82%', once: true },
      opacity: 0,
      y: 40,
      duration: 0.7,
      ease: 'power3.out',
    });
    gsap.utils.toArray('.compare-table tbody tr').forEach((row, i) => {
      gsap.from(row, {
        scrollTrigger: { trigger: '.compare-wrap', start: 'top 78%', once: true },
        opacity: 0,
        y: 14,
        duration: 0.4,
        delay: 0.15 + i * 0.05,
        ease: 'power2.out',
      });
    });
  }

  // Stats fly-in
  gsap.utils.toArray('.stat-card').forEach((stat, i) => {
    gsap.to(stat, {
      scrollTrigger: { trigger: '.stats-grid', start: 'top 75%', once: true },
      opacity: 1,
      y: 0,
      scale: 1,
      duration: 0.6,
      delay: i * 0.12,
      ease: 'back.out(1.4)',
    });
  });

  // ─── Before/After Slider ───
  function initBAComparison(container) {
    if (!container.querySelector('.ba-handle')) return;

    let isDragging = false;
    let pendingX = null;
    let dragFrame = 0;

    function setPosition(x) {
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) return;
      let percent = ((x - rect.left) / rect.width) * 100;
      percent = Math.max(5, Math.min(95, percent));
      container.style.setProperty('--ba-split', percent + '%');
    }

    const startDrag = (e) => {
      isDragging = true;
      container.setPointerCapture?.(e.pointerId);
      setPosition(e.clientX);
    };

    const moveDrag = (e) => {
      if (!isDragging) return;
      pendingX = e.clientX;
      if (!dragFrame) {
        dragFrame = requestAnimationFrame(() => {
          dragFrame = 0;
          setPosition(pendingX);
          pendingX = null;
        });
      }
    };

    const endDrag = (e) => {
      if (!isDragging) return;
      if (dragFrame) cancelAnimationFrame(dragFrame);
      dragFrame = 0;
      if (pendingX !== null) setPosition(pendingX);
      pendingX = null;
      isDragging = false;
      if (container.hasPointerCapture?.(e.pointerId)) container.releasePointerCapture(e.pointerId);
    };

    container.addEventListener('pointerdown', startDrag, { passive: true });
    container.addEventListener('pointermove', moveDrag, { passive: true });
    container.addEventListener('pointerup', endDrag, { passive: true });
    container.addEventListener('pointercancel', endDrag, { passive: true });
  }

  document.querySelectorAll('.ba-comparison').forEach(initBAComparison);

  // BA slide navigation
  const baNavBtns = document.querySelectorAll('.ba-nav-btn');
  const baSlides = document.querySelectorAll('.ba-slide');
  let baActivation = 0;

  function prioritizeBASlide(index) {
    const images = Array.from(baSlides[index]?.querySelectorAll('img') || []);
    images.forEach((img) => {
      img.loading = 'eager';
      img.fetchPriority = 'high';
    });
    return images;
  }

  function warmBASlide(index) {
    baSlides[index]?.querySelectorAll('img').forEach((img) => {
      img.loading = 'eager';
      img.fetchPriority = 'low';
    });
  }

  function decodeBAImage(img) {
    if (typeof img.decode === 'function') return img.decode().catch(() => undefined);
    if (img.complete) return Promise.resolve();
    return new Promise((resolve) => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    });
  }

  const transformationsSection = document.getElementById('transformations');
  if ('IntersectionObserver' in window && transformationsSection) {
    const warmObserver = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      warmBASlide(0);
      warmObserver.disconnect();
    }, { rootMargin: '800px 0px' });
    warmObserver.observe(transformationsSection);
  } else {
    window.addEventListener('load', () => warmBASlide(0), { once: true });
  }

  baNavBtns.forEach((btn) => {
    const index = parseInt(btn.dataset.slide, 10);
    btn.addEventListener('pointerenter', () => prioritizeBASlide(index), { passive: true });
    btn.addEventListener('focus', () => prioritizeBASlide(index), { passive: true });
    btn.addEventListener('click', async () => {
      const activation = ++baActivation;
      const images = prioritizeBASlide(index);
      await Promise.all(images.map(decodeBAImage));
      if (activation !== baActivation) return;
      baNavBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      baSlides.forEach((slide) => slide.classList.remove('active'));
      baSlides[index]?.classList.add('active');
    });
  });

  function closeLightbox(el) {
    el.classList.remove('open');
    el.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  document.querySelectorAll('.lightbox-close, .lightbox-backdrop').forEach((el) => {
    el.addEventListener('click', () => {
      closeLightbox(el.closest('.lightbox') || el.closest('.video-modal'));
    });
  });

  // ─── Color Wheel ───
  const colorSwatches = document.querySelectorAll('.color-swatch');
  const colorChips = document.querySelectorAll('.color-chip');
  const colorName = document.getElementById('colorName');
  const colorCode = document.getElementById('colorCode');
  const colorPreview = document.querySelector('.color-preview-surface');

  function selectColor(color, code, swatchHex) {
    colorSwatches.forEach((s) => {
      s.classList.toggle('active', s.dataset.color === color);
    });
    colorChips.forEach((c) => {
      c.classList.toggle('active', c.dataset.color === color);
    });
    colorName.textContent = color;
    colorCode.textContent = code;
    colorPreview.style.background = swatchHex;
    gsap.from(colorPreview, { scale: 0.9, duration: 0.4, ease: 'back.out(1.5)' });
  }

  colorSwatches.forEach((swatch) => {
    swatch.addEventListener('click', () => {
      selectColor(swatch.dataset.color, swatch.dataset.code, swatch.dataset.swatch);
    });
  });

  colorChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      selectColor(chip.dataset.color, chip.dataset.code, chip.dataset.swatch);
    });
  });

  // ─── FAQ Accordion ───
  document.querySelectorAll('.faq-question').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const isOpen = item.classList.contains('open');

      document.querySelectorAll('.faq-item').forEach((i) => {
        i.classList.remove('open');
        i.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
      });

      if (!isOpen) {
        item.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // ─── Parallax on scroll (desktop only)
  // Animate the wrap layer so CSS Ken Burns on the picture can keep running smoothly
  if (!isMobileHero && !reducedMotion) {
    gsap.to('.hero-video-wrap', {
      scrollTrigger: {
        trigger: '.hero',
        start: 'top top',
        end: 'bottom top',
        scrub: 1.2, // slight lag = butter-smooth feel
      },
      yPercent: 18,
      ease: 'none',
      force3D: true,
    });
  }

  // Escape key closes modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      [videoModal].forEach((modal) => {
        if (modal?.classList.contains('open')) closeLightbox(modal);
      });
    }
  });

  // Pause heavy work when the tab is hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      gsap.globalTimeline.pause();
    } else {
      gsap.globalTimeline.resume();
      ScrollTrigger.refresh();
    }
  });

})();
