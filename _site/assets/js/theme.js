(function() {
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return;
  
  const moonIcon = document.querySelector('.moon-icon');
  const sunIcon = document.querySelector('.sun-icon');
  
  function updateIcons(theme) {
    if (!moonIcon || !sunIcon) return;
    if (theme === 'dark') {
      moonIcon.style.display = 'none';
      sunIcon.style.display = 'block';
    } else {
      moonIcon.style.display = 'block';
      sunIcon.style.display = 'none';
    }
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    updateIcons(theme);
  }

  // Sync icons to current active theme state
  const currentThemeAttr = document.documentElement.getAttribute('data-theme');
  const currentTheme = (currentThemeAttr === 'dark' || currentThemeAttr === 'light') ? currentThemeAttr : 'light';
  updateIcons(currentTheme);

  toggle.addEventListener('click', () => {
    const activeThemeAttr = document.documentElement.getAttribute('data-theme');
    const activeTheme = (activeThemeAttr === 'dark' || activeThemeAttr === 'light') ? activeThemeAttr : 'light';
    const nextTheme = activeTheme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
  });
})();
