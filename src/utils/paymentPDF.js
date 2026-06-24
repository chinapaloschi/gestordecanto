export async function exportPaymentReceiptPDFWithLogo({ alumno, fecha, concepto, monto, logoUrl = '/logo.png' }) {
  try {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: [227, 400] });
    const PAGE_W = doc.internal.pageSize.getWidth();
    const M = 20;
    let y = M + 10;

    if (logoUrl) {
      try {
        const blob = await fetch(logoUrl, { cache: "no-store" }).then(r => r.blob());
        const base64 = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
        const logoWidth = 60;
        doc.addImage(base64, "PNG", (PAGE_W - logoWidth) / 2, y, logoWidth, logoWidth);
        y += logoWidth + 20;
      } catch (e) { console.warn("No se pudo cargar el logo:", e); }
    }

    doc.setFont("helvetica", "bold"); doc.setFontSize(14);
    doc.text("Comprobante de Pago", PAGE_W / 2, y, { align: 'center' }); y += 25;
    doc.setLineDashPattern([2, 2], 0); doc.line(M, y, PAGE_W - M, y); y += 25;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);

    const ticketNumber = `Nº ${Date.now().toString().slice(-8)}`;
    const addLine = (label, value) => {
      doc.setFont("helvetica", "bold"); doc.text(label, M, y);
      doc.setFont("helvetica", "normal"); doc.text(String(value || '-'), PAGE_W - M, y, { align: 'right' });
      y += 20;
    };

    addLine("Operación:", ticketNumber);
    addLine("Alumno/a:", alumno);
    addLine("Fecha:", fecha);
    const conceptoDisplay = concepto.length > 30 ? concepto.substring(0, 27) + '...' : concepto;
    addLine("Concepto:", conceptoDisplay);

    y += 10;
    doc.setFont("helvetica", "bold"); doc.setFontSize(14);
    doc.text("TOTAL:", M, y); doc.text(`$${monto}`, PAGE_W - M, y, { align: 'right' }); y += 30;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(150);
    doc.text("Este comprobante es válido como constancia de pago.", PAGE_W / 2, y, { align: 'center' });

    doc.save(`Comprobante_${(alumno || "alumno").replace(/\s+/g, "_")}_${fecha.replace(/\//g, '-')}.pdf`);
  } catch (err) {
    console.error("Error generando comprobante con logo:", err);
    alert("No se pudo generar el comprobante en PDF.");
  }
}

export async function exportPaymentPDF({ alumno, fecha, concepto, monto, medio, observaciones }) {
  try {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "A4" });
    const left = 56, top = 64;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Comprobante de Pago", left, top);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    if (alumno) doc.text(`Alumno/a: ${alumno}`, left, top + 30);
    if (fecha) doc.text(`Fecha: ${fecha}`, left, top + 50);
    if (concepto) doc.text(`Concepto: ${concepto}`, left, top + 70);
    if (monto != null && monto !== "") doc.text(`Monto: $${monto}`, left, top + 90);
    if (medio) doc.text(`Medio: ${medio}`, left, top + 110);
    if (observaciones) doc.text(`Obs.: ${observaciones}`, left, top + 130);

    doc.setFontSize(10);
    doc.text("Este comprobante es válido como constancia de pago.", left, top + 160);

    const filename = `Pago_${(alumno || "alumno").replace(/\s+/g, "_")}.pdf`;
    doc.save(filename);
  } catch (err) {
    console.error("Error generando comprobante:", err);
  }
}

export async function buildPaymentPDFFile({ alumno, fecha, concepto, monto, medio, observaciones }) {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "A4" });
  const left = 56, top = 64;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Comprobante de Pago", left, top);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  if (alumno) doc.text(`Alumno/a: ${alumno}`, left, top + 30);
  if (fecha) doc.text(`Fecha: ${fecha}`, left, top + 50);
  if (concepto) doc.text(`Concepto: ${concepto}`, left, top + 70);
  if (monto != null && monto !== "") doc.text(`Monto: $${monto}`, left, top + 90);
  if (medio) doc.text(`Medio: ${medio}`, left, top + 110);
  if (observaciones) doc.text(`Obs.: ${observaciones}`, left, top + 130);

  doc.setFontSize(10);
  doc.text("Este comprobante es válido como constancia de pago.", left, top + 160);

  const blob = doc.output("blob");
  const filename = `Pago_${(alumno || "alumno").replace(/\s+/g, "_")}.pdf`;
  const file = new File([blob], filename, { type: "application/pdf" });
  return { file, filename };
}

export async function sharePayment({ alumno, fecha, concepto, monto, medio, observaciones, stopEvent, fallbackDownload = true }) {
  try {
    if (stopEvent) { try { stopEvent.preventDefault(); } catch(_) {} try { stopEvent.stopPropagation(); } catch(_) {} }

    let pdfFile = null;
    try {
      const built = await buildPaymentPDFFile({ alumno, fecha, concepto, monto, medio, observaciones });
      pdfFile = built?.file || null;
    } catch (e) { console.warn("No se pudo generar PDF para compartir:", e); }

    const texto = `Comprobante de pago\nAlumno: ${alumno || ""}\nFecha: ${fecha || ""}\nConcepto: ${concepto || ""}\nMonto: $${monto || ""}${medio ? `\nMedio: ${medio}` : ""}${observaciones ? `\nObs.: ${observaciones}` : ""}`;

    if (pdfFile && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
      await navigator.share({ title: "Comprobante de pago", text: texto, files: [pdfFile] });
      return true;
    }
    if (navigator.share) {
      await navigator.share({ title: "Comprobante de pago", text: texto });
      return true;
    }

    if (fallbackDownload && pdfFile) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(pdfFile);
      a.download = pdfFile.name || "Comprobante.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
    try {
      await navigator.clipboard.writeText(texto);
      alert("Compartir no disponible. Se descargó el PDF y se copió el texto.");
    } catch {
      if (fallbackDownload && !pdfFile) alert("Compartir no disponible. No se pudo generar el PDF.");
    }
    return false;
  } catch (err) {
    console.error("sharePayment error:", err);
    alert("No se pudo compartir el comprobante.");
    return false;
  }
}
