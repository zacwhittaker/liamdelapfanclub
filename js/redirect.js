/* Legacy *.html URLs → clean paths (used by root redirect stubs). */
(function () {
  var name = (location.pathname.split('/').pop() || '').replace(/\.html$/i, '');
  if (!name || name === 'index') {
    location.replace('./');
    return;
  }
  location.replace(name + '/');
})();
