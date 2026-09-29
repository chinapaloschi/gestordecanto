import QRCode from 'qrcode';

// Estas tres funciones vivían adentro de AdminModals.jsx pero nunca se
// exportaron ni se importaron desde ningún lado — cada pantalla que
// necesitaba generar/compartir/descargar el QR de una entrada las llamaba
// como si fueran globales, así que tiraban ReferenceError siempre. Ver el
// QR de una entrada, compartirla o descargarla estaba roto de punta a
// punta para todos (panel y portal del alumno) hasta este arreglo.

// Helper para convertir Data URL a un archivo (para compartir)
export async function dataUrlToFile(dataUrl, fileName) {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return new File([blob], fileName, { type: blob.type });
  } catch (e) {
    console.error("Error al convertir data URL a archivo:", e);
    return null;
  }
}

export async function generateQrWithLogo(qrData, logoSrc, qrSize = 128) {
  let qrCanvas;

  try {
    qrCanvas = document.createElement('canvas');
    await QRCode.toCanvas(qrCanvas, qrData, {
      width: qrSize,
      margin: 1,
      errorCorrectionLevel: 'H'
    });

    const ctx = qrCanvas.getContext('2d');
    const logoImage = new Image();
    logoImage.src = logoSrc;
    logoImage.crossOrigin = "anonymous";

    await new Promise((resolve, reject) => {
        logoImage.onload = resolve;
        logoImage.onerror = (err) => reject(new Error("No se pudo cargar la imagen del logo. Verifica que la ruta '/logo.png' sea correcta en tu carpeta 'public'."));
    });

    const logoSize = qrSize * 0.3;
    const logoX = (qrSize - logoSize) / 2;
    const logoY = (qrSize - logoSize) / 2;

    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2 + 4, 0, 2 * Math.PI);
    ctx.fill();

    ctx.drawImage(logoImage, logoX, logoY, logoSize, logoSize);

    return qrCanvas.toDataURL('image/png');
  } catch (error) {
    console.error("Error al generar QR con logo:", error);

    if (qrCanvas) {
      console.warn("Fallback: Devolviendo QR sin logo.");
      return qrCanvas.toDataURL('image/png');
    }

    return null;
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar la imagen: ${src}`));
    img.src = src;
  });
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// El flyer del estudio (afiche completo, con título/fecha/lugar ya
// diseñados) va intacto en la parte de arriba de la imagen; el QR y los
// datos de la entrada van en una franja propia debajo, en vez de superponer
// texto sobre el afiche y arriesgar que quede ilegible.
export async function generateComposedTicketImage(qrData, eventInfo, logoSrc, backgroundSrc = '/images/entrada-fondo.jpg') {
  try {
    const bgImage = await loadImage(backgroundSrc);

    const cardWidth = 750;
    const flyerHeight = Math.round(cardWidth * (bgImage.naturalHeight / bgImage.naturalWidth));
    const footerHeight = 340;
    const cardHeight = flyerHeight + footerHeight;

    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = cardWidth;
    finalCanvas.height = cardHeight;
    const ctx = finalCanvas.getContext('2d');

    ctx.drawImage(bgImage, 0, 0, cardWidth, flyerHeight);

    // Franja inferior, mismo tono oscuro/cálido que las sombras del afiche.
    ctx.fillStyle = '#170f0c';
    ctx.fillRect(0, flyerHeight, cardWidth, footerHeight);

    let y = flyerHeight + 46;

    const qrSize = 210;
    const qrCodeWithLogoUrl = await generateQrWithLogo(qrData, logoSrc, qrSize * 2);
    if (!qrCodeWithLogoUrl) throw new Error("Falló la generación del QR con logo.");
    const qrImage = await loadImage(qrCodeWithLogoUrl);

    const qrPad = 14;
    const qrBoxSize = qrSize + qrPad * 2;
    const qrBoxX = (cardWidth - qrBoxSize) / 2;
    ctx.fillStyle = '#ffffff';
    roundRectPath(ctx, qrBoxX, y, qrBoxSize, qrBoxSize, 18);
    ctx.fill();
    ctx.drawImage(qrImage, qrBoxX + qrPad, y + qrPad, qrSize, qrSize);
    y += qrBoxSize + 38;

    ctx.textAlign = 'center';
    ctx.fillStyle = '#e3c17e';
    ctx.font = 'bold 28px Georgia, "Times New Roman", serif';
    ctx.fillText(eventInfo.ticketNumber ? `ENTRADA N° ${eventInfo.ticketNumber}` : 'ENTRADA', cardWidth / 2, y);

    if (eventInfo.attendee) {
      y += 36;
      ctx.fillStyle = '#f5efe4';
      ctx.font = '22px Georgia, "Times New Roman", serif';
      ctx.fillText(eventInfo.attendee.toUpperCase(), cardWidth / 2, y);
    }

    return finalCanvas.toDataURL('image/png');
  } catch (error) {
    console.error("Error al generar imagen de ticket compuesta:", error);
    return null;
  }
}
