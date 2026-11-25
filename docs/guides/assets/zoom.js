// Click a picture in the guide to see it at full size; click again or press Esc to close.
(() => {
  const dialog = document.createElement('dialog');
  dialog.className = 'zoom';
  const big = document.createElement('img');
  dialog.append(big);
  dialog.addEventListener('click', () => dialog.close());
  document.addEventListener('DOMContentLoaded', () => document.body.append(dialog));
  document.addEventListener('click', (e) => {
    const img = e.target instanceof HTMLImageElement ? e.target : null;
    if (!img || !img.closest('.md-content') || img.closest('a')) return;
    big.src = img.currentSrc || img.src;
    big.alt = img.alt;
    dialog.showModal();
  });
})();
