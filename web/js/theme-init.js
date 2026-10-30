(function () {
  try {
    var t = localStorage.getItem('gothwad-theme');
    document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
  } catch (e) { /* light default */ }
})();
