import jsPDF from 'jspdf';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface FinancialEntry {
  id: string;
  category: string;
  description: string;
  amount: number;
  due_date: string;
  payment_date: string | null;
  status: string;
  pix_key: string | null;
  supplier?: {
    name: string;
    pix_key: string | null;
  };
}

interface ReportOptions {
  projectName: string;
  entries: FinancialEntry[];
  categories: string[];
  filterStatus?: 'all' | 'pending' | 'paid';
}

export function generatePDFReport({ projectName, entries, categories, filterStatus = 'pending' }: ReportOptions) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = 20;

  // Filter entries based on status
  const filteredEntries = filterStatus === 'all' 
    ? entries 
    : entries.filter(e => e.status === filterStatus);

  // Header
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('RELATÓRIO DE PAGAMENTOS', pageWidth / 2, y, { align: 'center' });
  
  y += 10;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(projectName, pageWidth / 2, y, { align: 'center' });
  
  y += 8;
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`, pageWidth / 2, y, { align: 'center' });
  doc.text(`Status: ${filterStatus === 'all' ? 'Todos' : filterStatus === 'pending' ? 'Pendentes' : 'Pagos'}`, pageWidth / 2, y + 5, { align: 'center' });
  
  y += 15;
  
  // Separator line
  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  // Summary box
  const total = filteredEntries.reduce((sum, e) => sum + Number(e.amount), 0);
  const pendingTotal = filteredEntries.filter(e => e.status === 'pending').reduce((sum, e) => sum + Number(e.amount), 0);
  const paidTotal = filteredEntries.filter(e => e.status === 'paid').reduce((sum, e) => sum + Number(e.amount), 0);
  
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(margin, y, pageWidth - 2 * margin, 25, 3, 3, 'F');
  
  doc.setTextColor(0);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  
  const boxY = y + 8;
  doc.text('Total:', margin + 5, boxY);
  doc.text('Pendente:', margin + 60, boxY);
  doc.text('Pago:', margin + 120, boxY);
  
  doc.setFont('helvetica', 'normal');
  doc.text(formatCurrency(total), margin + 5, boxY + 10);
  doc.setTextColor(200, 150, 0);
  doc.text(formatCurrency(pendingTotal), margin + 60, boxY + 10);
  doc.setTextColor(0, 150, 0);
  doc.text(formatCurrency(paidTotal), margin + 120, boxY + 10);
  
  y += 35;

  // Entries by category
  doc.setTextColor(0);
  
  categories.forEach(category => {
    const categoryEntries = filteredEntries.filter(e => e.category === category);
    if (categoryEntries.length === 0) return;
    
    // Check if we need a new page
    if (y > 260) {
      doc.addPage();
      y = 20;
    }
    
    // Category header
    doc.setFillColor(70, 130, 180);
    doc.roundedRect(margin, y, pageWidth - 2 * margin, 8, 2, 2, 'F');
    doc.setTextColor(255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(category, margin + 3, y + 5.5);
    
    const categoryTotal = categoryEntries.reduce((sum, e) => sum + Number(e.amount), 0);
    doc.text(formatCurrency(categoryTotal), pageWidth - margin - 3, y + 5.5, { align: 'right' });
    
    y += 12;
    
    // Entries
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    
    categoryEntries.forEach(entry => {
      if (y > 275) {
        doc.addPage();
        y = 20;
      }
      
      // Entry row
      const statusColor = entry.status === 'paid' ? [0, 150, 0] : entry.status === 'overdue' ? [200, 0, 0] : [100, 100, 100];
      
      // Status indicator
      doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
      doc.circle(margin + 2, y + 2, 1.5, 'F');
      
      // Description
      const maxDescWidth = 80;
      const description = entry.description.length > 40 
        ? entry.description.substring(0, 40) + '...' 
        : entry.description;
      doc.setTextColor(0);
      doc.text(description, margin + 6, y + 3);
      
      // Due date
      doc.setTextColor(100);
      doc.setFontSize(8);
      doc.text(`Venc: ${format(parseISO(entry.due_date), 'dd/MM/yyyy')}`, margin + 90, y + 3);
      
      // Amount
      doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(formatCurrency(Number(entry.amount)), pageWidth - margin - 3, y + 3, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      
      // PIX info
      const pixKey = entry.pix_key || entry.supplier?.pix_key;
      if (pixKey) {
        doc.setTextColor(100);
        doc.setFontSize(7);
        const displayPix = pixKey.length > 30 ? pixKey.substring(0, 30) + '...' : pixKey;
        doc.text(`PIX: ${displayPix}`, margin + 6, y + 8);
        y += 4;
      }
      
      // Supplier name
      if (entry.supplier?.name) {
        doc.setTextColor(80);
        doc.setFontSize(7);
        doc.text(`Fornecedor: ${entry.supplier.name}`, margin + 6, y + 8);
        y += 4;
      }
      
      y += 10;
    });
    
    y += 5;
  });
  
  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    const pageH = doc.internal.pageSize.getHeight();
    doc.text(`Página ${i} de ${pageCount}`, pageWidth / 2, pageH - 10, { align: 'center' });
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text("© 2026 ObraMap | Engenharia Digital", pageWidth / 2, pageH - 4, { align: 'center' });
  }
  
  // Save the PDF
  const fileName = `relatorio_pagamentos_${format(new Date(), 'yyyy-MM-dd_HHmm')}.pdf`;
  doc.save(fileName);
  
  return fileName;
}

function formatCurrency(value: number): string {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
