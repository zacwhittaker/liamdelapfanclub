/* Site root helpers + clean URLs (no .html in the address bar). */
(function () {
  'use strict';

  var parts = location.pathname.split('/').filter(Boolean);
  var pages = { profile: 1, rules: 1, privacy: 1, terms: 1 };
  var href = '/';

  if (parts.length === 0) {
    href = '/';
  } else if (parts.length === 1) {
    if (parts[0].indexOf('.') !== -1) {
      href = '/';
    } else if (pages[parts[0]]) {
      href = '/';
    } else {
      href = '/' + parts[0] + '/';
    }
  } else if (pages[parts[parts.length - 1]]) {
    href = '/' + parts[0] + '/';
  }

  window.LDFC_SITE_ROOT = href;

  window.LDFC_ASSET = function (path) {
    return href + String(path).replace(/^\//, '');
  };

  var path = location.pathname;
  if (/\/index\.html$/i.test(path)) {
    var next = path.replace(/index\.html$/i, '');
    if (next.slice(-1) !== '/') next += '/';
    history.replaceState(null, '', next + location.search + location.hash);
  }
})();
