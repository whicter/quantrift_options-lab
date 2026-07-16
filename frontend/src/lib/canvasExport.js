export function canvasPngDataUrl(canvas) {
  if (!canvas || typeof canvas.toDataURL !== 'function') {
    throw new TypeError('A canvas with toDataURL is required.');
  }
  return canvas.toDataURL('image/png');
}

export function downloadCanvasPng(canvas, filename, documentRef = document) {
  const link = documentRef.createElement('a');
  link.href = canvasPngDataUrl(canvas);
  link.download = filename;
  link.click();
}
