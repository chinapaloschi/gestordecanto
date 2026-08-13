// Normaliza un número de WhatsApp argentino para armar un link wa.me. Antes
// esto se reimplementaba distinto en 6 lugares del código — algunos siempre
// agregaban "549" adelante (rompiendo números que ya venían con código de
// país), otros agregaban "54" sin el 9 de celular. Un número cargado con el
// 0 de área (ej. "011...") tampoco se limpiaba en ningún lado. El resultado:
// el mismo número de alumno podía dar un link distinto según la pantalla, y
// un link mal armado abre WhatsApp igual (no hay ningún error visible) pero
// no le llega a nadie.
//
// No intenta sacar el viejo prefijo "15" de celular — los códigos de área
// argentinos tienen largo variable, así que no hay forma confiable de
// distinguirlo del resto del número sin adivinar.
export function formatArgWhatsappNumber(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (digits.startsWith('54')) {
    const rest = digits.slice(2);
    digits = rest.startsWith('9') ? `54${rest}` : `549${rest}`;
  } else {
    digits = `549${digits}`;
  }
  return digits;
}

export function isValidArgWhatsappNumber(raw) {
  return String(raw || '').replace(/\D/g, '').length >= 8;
}

export function buildWhatsappLink(raw, text) {
  const num = formatArgWhatsappNumber(raw);
  if (!num) return null;
  return `https://wa.me/${num}?text=${encodeURIComponent(text || '')}`;
}
