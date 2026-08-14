// Redimensiona/comprime una imagen en el navegador antes de subirla. Las
// fotos de perfil se mostraban a 64px pero se subían tal cual las entrega el
// celular (varios MB, miles de píxeles de lado) — cada tarjeta de alumno
// terminaba decodificando la foto original entera sólo para achicarla por
// CSS, lo que trababa el scroll con muchas tarjetas en pantalla.
export function resizeImageFile(file, { maxDim = 480, quality = 0.85 } = {}) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error('No se pudo procesar la imagen.')); return; }
        resolve(blob);
      }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen.')); };
    img.src = url;
  });
}
