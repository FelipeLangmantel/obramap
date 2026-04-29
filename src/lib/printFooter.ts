/**
 * Rodapé padrão obrigatório em TODOS os documentos impressos do sistema:
 * Diário de Obras, Mapas, Relatórios financeiros, Planejamentos, etc.
 *
 * Use `PRINT_FOOTER_TEXT` para PDFs (jsPDF) e `PRINT_FOOTER_HTML` para
 * impressões HTML (window.print).
 */
export const PRINT_FOOTER_TEXT = "© 2026 ObraMap | Engenharia Digital";

export const PRINT_FOOTER_HTML = `
  <div style="position: fixed; bottom: 8px; left: 0; right: 0; text-align: center; font-size: 10px; color: #6b7280; font-family: Arial, sans-serif;">
    ${PRINT_FOOTER_TEXT}
  </div>
`;

/** CSS @page para forçar o rodapé visível em todas as páginas impressas (HTML/print). */
export const PRINT_FOOTER_PAGE_CSS = `
  @page { margin-bottom: 22mm; }
  .obramap-print-footer {
    position: fixed;
    bottom: 6mm;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 10px;
    color: #6b7280;
    font-family: Arial, sans-serif;
  }
`;

/**
 * Adiciona o rodapé "© 2026 ObraMap | Engenharia Digital" em todas as páginas
 * de um documento jsPDF. Chame APÓS gerar todo o conteúdo, antes de salvar.
 */
export function addObraMapFooterToPDF(doc: any) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    try { doc.setFont("helvetica", "normal"); } catch {}
    doc.text(PRINT_FOOTER_TEXT, pageW / 2, pageH - 4, { align: "center" });
  }
}
