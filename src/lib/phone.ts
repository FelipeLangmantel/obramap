// Utilitários para telefone BR (E.164) e links wa.me
//
// Formato armazenado: +55DDD9XXXXXXXX (E.164)
// Formato exibido: +55 (DDD) 9 XXXX-XXXX
// Aceita digitação flexível e normaliza.

const BR_E164 = /^\+55[1-9]{2}9?[0-9]{8}$/;

export function digitsOnly(input: string): string {
  return (input || "").replace(/\D+/g, "");
}

/** Normaliza qualquer entrada para E.164 BR. Retorna null se inválido. */
export function toE164BR(input: string | null | undefined): string | null {
  if (!input) return null;
  let d = digitsOnly(input);
  // remove DDI 55 se vier
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  // agora esperamos DDD (2) + 8 ou 9 dígitos = 10 ou 11
  if (d.length !== 10 && d.length !== 11) return null;
  const candidate = `+55${d}`;
  return BR_E164.test(candidate) ? candidate : null;
}

export function isValidPhoneBR(input: string | null | undefined): boolean {
  return toE164BR(input) !== null;
}

/** Formata para exibição: +55 (11) 9 8765-4321 */
export function formatPhoneBR(e164: string | null | undefined): string {
  if (!e164) return "";
  const d = digitsOnly(e164);
  const local = d.startsWith("55") ? d.slice(2) : d;
  if (local.length === 11) {
    return `+55 (${local.slice(0, 2)}) ${local.slice(2, 3)} ${local.slice(3, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `+55 (${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  return e164;
}

/** Máscara enquanto digita (input controlado). */
export function maskPhoneInputBR(value: string): string {
  const d = digitsOnly(value).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length === 11) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}`;
  }
  // 8-10
  return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
}

/** Gera link wa.me a partir de E.164 (sem '+'). */
export function buildWhatsAppLink(
  e164: string | null | undefined,
  message?: string
): string | null {
  const norm = toE164BR(e164 ?? "");
  if (!norm) return null;
  const phone = norm.replace(/\D/g, ""); // 55DDDxxx
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${phone}${text}`;
}
