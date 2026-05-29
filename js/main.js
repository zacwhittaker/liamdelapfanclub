(function () {
  'use strict';

  function initHeroVideo() {
    const video = document.querySelector('.hero__video');
    if (!video) return;

    const setPlaybackRate = () => {
      video.playbackRate = 0.92;
    };

    video.addEventListener('loadedmetadata', setPlaybackRate);
    setPlaybackRate();

    video.addEventListener('error', () => {
      const wrap = video.closest('.hero__video-wrap');
      if (wrap) wrap.style.background = 'var(--bg-base)';
      video.style.display = 'none';
    });
  }

  function initYear() {
    const year = new Date().getFullYear();
    document.querySelectorAll('.year').forEach((el) => {
      el.textContent = year;
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initHeroVideo();
    initYear();
  });
})();
