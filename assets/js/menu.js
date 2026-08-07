/* Menu principal compartilhado por todas as páginas públicas.
   Mantido separado do app.js para continuar funcionando mesmo se
   Supabase, mapa ou outro módulo da página falhar ao carregar. */
(function () {
  'use strict';

  function installMenu() {
    var buttons = document.querySelectorAll('.mobile-menu-btn');

    buttons.forEach(function (button, index) {
      if (button.dataset.menuReady === 'true') return;

      var nav = button.closest('.nav');
      var menu = nav ? nav.querySelector('.menu') : document.querySelector('#siteMenu');
      if (!menu) return;

      button.dataset.menuReady = 'true';
      if (!menu.id) menu.id = 'siteMenu-' + index;
      button.setAttribute('aria-controls', menu.id);
      button.setAttribute('aria-expanded', 'false');

      function setOpen(open) {
        menu.classList.toggle('open', open);
        nav && nav.classList.toggle('menu-is-open', open);
        document.body.classList.toggle('site-menu-open', open);
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
        button.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
        button.innerHTML = open ? '<span aria-hidden="true">×</span>' : '<span aria-hidden="true">☰</span>';
      }

      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(!menu.classList.contains('open'));
      });

      menu.addEventListener('click', function (event) {
        if (event.target.closest('a')) setOpen(false);
      });

      document.addEventListener('click', function (event) {
        if (menu.classList.contains('open') && nav && !nav.contains(event.target)) setOpen(false);
      });

      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && menu.classList.contains('open')) {
          setOpen(false);
          button.focus();
        }
      });

      window.addEventListener('resize', function () {
        if (window.innerWidth > 760 && menu.classList.contains('open')) setOpen(false);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installMenu, { once: true });
  } else {
    installMenu();
  }
})();
