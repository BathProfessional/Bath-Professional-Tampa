/* Shared accessible mobile navigation for the homepage and privacy policy. */
(function () {
  'use strict';

  const menuToggle = document.getElementById('menuToggle');
  const mobileMenu = document.getElementById('mobileMenu');
  if (!menuToggle || !mobileMenu) return;

  function setOpen(open) {
    mobileMenu.classList.toggle('open', open);
    menuToggle.classList.toggle('active', open);
    document.documentElement.classList.toggle('menu-open', open);
    document.body.classList.toggle('menu-open', open);
    mobileMenu.inert = !open;
    mobileMenu.setAttribute('aria-hidden', String(!open));
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.dispatchEvent(new CustomEvent('bath:menu-change', { detail: { open } }));
  }

  setOpen(false);

  menuToggle.addEventListener('click', () => {
    setOpen(!mobileMenu.classList.contains('open'));
  });

  mobileMenu.querySelectorAll('.mobile-nav-link').forEach((link) => {
    link.addEventListener('click', () => setOpen(false));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !mobileMenu.classList.contains('open')) return;
    event.preventDefault();
    setOpen(false);
    menuToggle.focus({ preventScroll: true });
  });
})();

