import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface DiarioPDFConfig {
  showLogo: boolean;
  showHeader: boolean;
  showWeather: boolean;
  showTeam: boolean;
  showServices: boolean;
  showObservations: boolean;
  showCorrections: boolean;
  showPhotos: boolean;
  showSignatures: boolean;
}

export const DEFAULT_PDF_CONFIG: DiarioPDFConfig = {
  showLogo: true,
  showHeader: true,
  showWeather: true,
  showTeam: true,
  showServices: true,
  showObservations: true,
  showCorrections: true,
  showPhotos: true,
  showSignatures: true,
};

const CLIMA_LABELS: Record<string, string> = {
  sol: "Sol / Claro",
  nublado: "Nublado",
  chuva_fraca: "Chuva fraca",
  chuva_forte: "Chuva forte / Tempestade",
  vento: "Vento forte",
};

interface DiaryItem {
  macro_name: string;
  scope_name: string;
  house_ids: number[];
  percentual_executado: number;
  observacao: string | null;
}

interface Correction {
  tipo: string;
  macro_name: string;
  scope_name: string;
  house_ids_anterior: number[] | null;
  house_ids_posterior: number[] | null;
  percentual_anterior: number | null;
  percentual_posterior: number | null;
  justificativa: string;
  corrigido_por_nome: string;
}

export interface DiarioPDFData {
  logoUrl: string | null;
  companyName: string;
  projectName: string;
  projectLocation: string | null;
  contractor: string | null;
  engineerName: string;
  entryDate: string;
  clima: string | null;
  equipePresente: number;
  observacaoGeral: string | null;
  items: DiaryItem[];
  correcoes: Correction[];
  photoUrls: string[]; // signed URLs
  reportNumber: number | null;
}

async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise(resolve => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateDiarioPDF(
  data: DiarioPDFData,
  config: DiarioPDFConfig = DEFAULT_PDF_CONFIG
): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 12;
  let y = margin;

  const dateObj = parseISO(data.entryDate);
  const dateFmt = format(dateObj, "dd/MM/yyyy", { locale: ptBR });
  const weekday = format(dateObj, "EEEE", { locale: ptBR });

  // ─── Cabeçalho com logo ───────────────────────────────────────────
  if (config.showHeader) {
    // Logo (esquerda)
    let logoH = 0;
    if (config.showLogo && data.logoUrl) {
      const dataUrl = await loadImageAsDataUrl(data.logoUrl);
      if (dataUrl) {
        try {
          doc.addImage(dataUrl, "PNG", margin, y, 35, 18);
          logoH = 18;
        } catch {
          // formato não suportado — ignora
        }
      }
    }

    // Bloco direita: nº relatório / data / dia da semana
    const rightX = pageW - margin - 60;
    doc.setDrawColor(180);
    doc.setLineWidth(0.2);
    doc.rect(rightX, y, 60, 18);
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text("Relatório nº", rightX + 2, y + 4);
    doc.text("Data", rightX + 2, y + 10);
    doc.text("Dia da semana", rightX + 2, y + 16);
    doc.setTextColor(20);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(String(data.reportNumber ?? "-"), rightX + 30, y + 4);
    doc.text(dateFmt, rightX + 30, y + 10);
    doc.text(weekday.charAt(0).toUpperCase() + weekday.slice(1), rightX + 30, y + 16);
    doc.setFont("helvetica", "normal");

    y += Math.max(logoH, 18) + 4;

    // Título
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20);
    doc.text("Relatório Diário de Obra (RDO)", pageW / 2, y, { align: "center" });
    y += 6;

    // Linha de identificação
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80);
    const identLines = [
      `Obra: ${data.projectName}`,
      data.projectLocation ? `Endereço: ${data.projectLocation}` : null,
      data.contractor ? `Contratada: ${data.contractor}` : null,
      `Responsável: ${data.engineerName}`,
    ].filter(Boolean) as string[];
    identLines.forEach(line => {
      doc.text(line, margin, y);
      y += 4.5;
    });
    y += 2;
  }

  // ─── Clima ────────────────────────────────────────────────────────
  if (config.showWeather && data.clima) {
    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [240, 240, 240], textColor: 30, fontStyle: "bold" },
      head: [["Clima"]],
      body: [[CLIMA_LABELS[data.clima] || data.clima]],
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 3;
  }

  // ─── Equipe ───────────────────────────────────────────────────────
  if (config.showTeam) {
    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [240, 240, 240], textColor: 30, fontStyle: "bold" },
      head: [[`Mão de obra (${data.equipePresente})`]],
      body: [[`Total presente no dia: ${data.equipePresente} colaborador(es)`]],
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 3;
  }

  // ─── Serviços / Atividades ────────────────────────────────────────
  if (config.showServices && data.items.length > 0) {
    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 2, valign: "middle" },
      headStyles: { fillColor: [240, 240, 240], textColor: 30, fontStyle: "bold" },
      head: [[`Atividades (${data.items.length})`, "Casas", "%", "Status"]],
      body: data.items.map(item => [
        `${item.macro_name} — ${item.scope_name}${item.observacao ? `\n${item.observacao}` : ""}`,
        item.house_ids.sort((a, b) => a - b).map(h => String(h).padStart(2, "0")).join(", "),
        `${item.percentual_executado}%`,
        item.percentual_executado >= 100 ? "Concluído" : "Em andamento",
      ]),
      columnStyles: {
        0: { cellWidth: "auto" },
        1: { cellWidth: 50 },
        2: { cellWidth: 15, halign: "center" },
        3: { cellWidth: 28, halign: "center" },
      },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 3;
  } else if (config.showServices) {
    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [240, 240, 240], textColor: 30, fontStyle: "bold" },
      head: [["Atividades (0)"]],
      body: [["Nenhum serviço lançado neste dia."]],
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 3;
  }

  // ─── Observações ──────────────────────────────────────────────────
  if (config.showObservations && data.observacaoGeral) {
    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [240, 240, 240], textColor: 30, fontStyle: "bold" },
      head: [["Observações gerais"]],
      body: [[data.observacaoGeral]],
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 3;
  }

  // ─── Correções ────────────────────────────────────────────────────
  if (config.showCorrections && data.correcoes.length > 0) {
    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [253, 230, 138], textColor: 30, fontStyle: "bold" },
      head: [[`Correções aplicadas (${data.correcoes.length})`]],
      body: data.correcoes.map(c => {
        let descr = `${c.corrigido_por_nome} — ${c.macro_name} / ${c.scope_name}\n`;
        if (c.tipo === "exclusao") descr += `Itens removidos: casas ${(c.house_ids_anterior || []).join(", ")}\n`;
        if (c.tipo === "ajuste_casas") descr += `Casas: ${(c.house_ids_anterior || []).join(", ")} → ${(c.house_ids_posterior || []).join(", ")}\n`;
        if (c.tipo === "ajuste_percentual") descr += `Percentual: ${c.percentual_anterior}% → ${c.percentual_posterior}%\n`;
        descr += `Justificativa: "${c.justificativa}"`;
        return [descr];
      }),
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 3;
  }

  // ─── Fotos ────────────────────────────────────────────────────────
  if (config.showPhotos && data.photoUrls.length > 0) {
    if (y > 240) {
      doc.addPage();
      y = margin;
    }
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20);
    doc.text(`Fotos (${data.photoUrls.length})`, margin, y);
    y += 4;

    const cols = 3;
    const gap = 3;
    const cellW = (pageW - margin * 2 - gap * (cols - 1)) / cols;
    const cellH = cellW * 0.75;

    let col = 0;
    for (const url of data.photoUrls) {
      if (y + cellH > 280) {
        doc.addPage();
        y = margin;
      }
      const dataUrl = await loadImageAsDataUrl(url);
      if (dataUrl) {
        try {
          const x = margin + col * (cellW + gap);
          doc.addImage(dataUrl, "JPEG", x, y, cellW, cellH);
        } catch {
          // ignora foto problemática
        }
      }
      col++;
      if (col >= cols) {
        col = 0;
        y += cellH + gap;
      }
    }
    if (col !== 0) y += cellH + gap;
  }

  // ─── Assinaturas ──────────────────────────────────────────────────
  if (config.showSignatures) {
    if (y > 250) {
      doc.addPage();
      y = margin;
    } else {
      y += 6;
    }
    const signW = (pageW - margin * 2 - 10) / 2;
    doc.setDrawColor(120);
    doc.setLineWidth(0.3);
    doc.line(margin, y + 14, margin + signW, y + 14);
    doc.line(margin + signW + 10, y + 14, margin + signW * 2 + 10, y + 14);
    doc.setFontSize(8);
    doc.setTextColor(80);
    doc.text("Engenheiro Responsável", margin + signW / 2, y + 18, { align: "center" });
    doc.text(data.engineerName, margin + signW / 2, y + 22, { align: "center" });
    doc.text("Fiscal / Contratante", margin + signW + 10 + signW / 2, y + 18, { align: "center" });
  }

  // ─── Rodapé com paginação ─────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(140);
    doc.text(
      `${data.companyName} — RDO ${dateFmt} — Página ${i} de ${pageCount}`,
      pageW / 2,
      doc.internal.pageSize.getHeight() - 6,
      { align: "center" }
    );
  }

  doc.save(`RDO_${data.projectName.replace(/[^a-zA-Z0-9]/g, "_")}_${dateFmt.replace(/\//g, "-")}.pdf`);
}
