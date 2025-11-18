let clickSfx = null;
let unlocked = false;

export function initSound() {
  if (typeof Howl === 'undefined') {
    console.warn('[sound] Howler not found. Did you include howler.min.js in index.html?');
    return;
  }

  // Path is relative to index.html (where the browser URL is), not this file
  clickSfx = new Howl({
    src: ['./sounds/turn.mp3'],
    preload: true,
    volume: 0.5,
    html5: true, // helps on some mobile browsers
    onload: () => console.log('[sound] turn.mp3 loaded'),
    onloaderror: (id, err) => console.error('[sound] load error', err),
  });

  // One-time unlock after first user interaction (required by autoplay policies)
  const unlock = () => {
    if (!unlocked && clickSfx) {
      try {
        const id = clickSfx.play();
        clickSfx.stop(id);
        unlocked = true;
        console.log('[sound] audio unlocked');
      } catch (e) {
        console.warn('[sound] unlock failed', e);
      }
    }
    window.removeEventListener('click', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };
  window.addEventListener('click', unlock, true);
  window.addEventListener('keydown', unlock, true);
}

export function playClick() {
  if (clickSfx && clickSfx.state() === 'loaded') {
    clickSfx.play();
  }
}
