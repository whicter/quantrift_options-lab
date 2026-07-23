export function canvasPngDataUrl(canvas) {
  if (!canvas || typeof canvas.toDataURL !== 'function') {
    throw new TypeError('A canvas with toDataURL is required.');
  }
  return canvas.toDataURL('image/png');
}

export function downloadCanvasPng(canvas, filename, documentRef = document, annotation = '') {
  let source = canvas;
  if (annotation) {
    const exportCanvas = documentRef.createElement('canvas');
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height + Math.max(36, Math.round(canvas.height * 0.1));
    const context = exportCanvas.getContext('2d');
    context.drawImage(canvas, 0, 0);
    context.fillStyle = '#0b0e14';
    context.fillRect(0, canvas.height, exportCanvas.width, exportCanvas.height - canvas.height);
    context.fillStyle = '#9aa8bc';
    context.font = `${Math.max(10, Math.round(canvas.width / 60))}px sans-serif`;
    context.textAlign = 'center';
    context.fillText(annotation, exportCanvas.width / 2, canvas.height + Math.max(22, Math.round((exportCanvas.height - canvas.height) / 2) + 4));
    source = exportCanvas;
  }
  const link = documentRef.createElement('a');
  link.href = canvasPngDataUrl(source);
  link.download = filename;
  link.click();
}
