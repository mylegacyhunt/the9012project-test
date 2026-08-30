/* 90:12 home-screen identity. This does not unlock or apply unfinished themes.
 * Call setTheme only after a theme is applied, never when a card is previewed.
 * Browsers/operating systems, not this script, control installed icon updates.
 */
(function () {
  'use strict';
  var storageKey = '9012_app_icon_theme';
  var defaultTheme = 'lantern_heritage';
  var themes = {
    lantern_heritage: {
      favicon: 'assets/app-icons/lantern-heritage-32-v1.png',
      touchIcon: '/apple-touch-icon.png',
      manifest: 'manifest.webmanifest',
      color: '#140d06'
    },
    heirloom_light: {
      favicon: 'assets/app-icons/heirloom-light-32-v1.png',
      touchIcon: 'assets/app-icons/heirloom-light-180-v1.png',
      manifest: 'manifest-heirloom-light.webmanifest',
      color: '#f5eddf'
    }
  };
  var activeTheme = defaultTheme;

  function isKnown(key) {
    return Object.prototype.hasOwnProperty.call(themes, key);
  }

  function setAttribute(id, name, value) {
    var element = document.getElementById(id);
    if (element && element.getAttribute(name) !== value) {
      element.setAttribute(name, value);
    }
  }

  function apply(key) {
    activeTheme = isKnown(key) ? key : defaultTheme;
    var theme = themes[activeTheme];
    setAttribute('appFavicon', 'href', theme.favicon);
    setAttribute('appTouchIcon', 'href', theme.touchIcon);
    setAttribute('appManifest', 'href', theme.manifest);
    setAttribute('appThemeColor', 'content', theme.color);
    document.documentElement.setAttribute('data-app-icon-theme', activeTheme);
  }

  function readTheme() {
    try {
      return window.localStorage.getItem(storageKey) || defaultTheme;
    } catch (error) {
      return defaultTheme;
    }
  }

  window.app9012Icons = Object.freeze({
    getTheme: function () { return activeTheme; },
    setTheme: function (key) {
      if (!isKnown(key)) return false;
      apply(key);
      try { window.localStorage.setItem(storageKey, key); } catch (error) {}
      return true;
    }
  });

  // Run in the head before the main app starts; no account data is accessed.
  apply(readTheme());
  window.addEventListener('storage', function (event) {
    if (event.key === storageKey || event.key === null) apply(readTheme());
  });
}());
