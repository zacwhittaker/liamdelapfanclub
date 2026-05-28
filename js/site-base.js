/* Sets <base href> so css/assets work on GitHub Pages project URLs (with or without trailing slash). */
(function () {
  var parts = location.pathname.split('/').filter(Boolean);
  var href = '/';
  if (parts.length > 0 && parts[0].indexOf('.') === -1) {
    href = '/' + parts[0] + '/';
  }
  var base = document.createElement('base');
  base.href = href;
  document.head.insertBefore(base, document.head.firstChild);
})();
