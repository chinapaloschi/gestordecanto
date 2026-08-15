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

export async function generateComposedTicketImage(qrData, eventInfo, logoSrc) {
  try {
    const finalCanvas = document.createElement('canvas');
    const ctx = finalCanvas.getContext('2d');

    const cardWidth = 350;
    const cardHeight = 450;
    const padding = 25;

    finalCanvas.width = cardWidth;
    finalCanvas.height = cardHeight;

    // Fondo blanco
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, cardWidth, cardHeight);

    // --- LÓGICA MODIFICADA PARA EL TÍTULO ---
    let currentY = padding + 25; // Posición Y inicial para el texto
    const titleFont = 'bold 20px Arial';
    const titleLineHeight = 24; // Espacio entre renglones

    ctx.fillStyle = '#1f2937';
    ctx.font = titleFont;
    ctx.textAlign = 'center';

    const fullTitle = eventInfo.title.toUpperCase();
    const splitIndex = fullTitle.indexOf('('); // Busca el paréntesis

    let line1 = fullTitle;
    let line2 = null;

    // Si encuentra un paréntesis, divide el texto
    if (splitIndex > 0) {
        line1 = fullTitle.substring(0, splitIndex).trim();
        line2 = fullTitle.substring(splitIndex).trim();
    }

    // Dibuja la primera línea
    ctx.fillText(line1, cardWidth / 2, currentY);

    // Si hay una segunda línea, la dibuja y actualiza la posición
    if (line2) {
        currentY += titleLineHeight;
        ctx.fillText(line2, cardWidth / 2, currentY);
    }
    // --- FIN DE LA LÓGICA MODIFICADA ---

    // Dibuja el subtítulo (fecha y hora) ajustando su posición
    currentY += 30;
    ctx.font = '16px Arial';
    ctx.fillStyle = '#4b5563';
    ctx.fillText(eventInfo.subtitle, cardWidth / 2, currentY);

    // Dibuja el código QR, ajustando su posición
    currentY += 20;
    const qrCodeWithLogoUrl = await generateQrWithLogo(qrData, logoSrc, 200); // Un poco más chico para dar espacio
    if (!qrCodeWithLogoUrl) throw new Error("Falló la generación del QR con logo.");

    const qrImage = new Image();
    qrImage.src = qrCodeWithLogoUrl;
    await new Promise(resolve => { qrImage.onload = resolve; });

    ctx.drawImage(qrImage, (cardWidth - 200) / 2, currentY, 200, 200);
    currentY += 200; // Avanza la posición vertical

    // Dibuja el resto de los elementos ajustando su posición
    currentY += 30;
    ctx.font = '16px Arial';
    ctx.fillStyle = '#4b5563';
    ctx.fillText('Entrada para:', cardWidth / 2, currentY);

    currentY += 25;
    ctx.font = 'bold 20px Arial';
    ctx.fillStyle = '#D81B60';
    ctx.fillText(eventInfo.attendee.toUpperCase(), cardWidth / 2, currentY);

    currentY += 25;
    if (eventInfo.ticketNumber) {
        ctx.font = '16px Arial';
        ctx.fillStyle = '#4b5563';
        ctx.fillText(`Entrada N° ${eventInfo.ticketNumber}`, cardWidth / 2, currentY);
        currentY += 15;
    }

    if (eventInfo.ticketId) {
        ctx.font = '10px "Courier New", monospace';
        ctx.fillStyle = '#9ca3af';
        ctx.fillText(`ID: ${eventInfo.ticketId}`, cardWidth / 2, currentY);
    }

    return finalCanvas.toDataURL('image/png');
  } catch (error) {
    console.error("Error al generar imagen de ticket compuesta:", error);
    return null;
  }
}
