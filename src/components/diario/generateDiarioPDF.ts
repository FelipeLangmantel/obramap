import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface DiarioPDFConfig {
  showLogo: boolean;
  showHeader: boolean;
  showLegalHeader: boolean;
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
  showLegalHeader: true,
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

export interface LegalConfig {
  pdf_template: "orgao_publico" | "corporativo_moderno";
  contratante_tipo: string;
  contratante_nome: string | null;
  contratante_cnpj_cpf: string | null;
  contratante_orgao: string | null;
  contratante_endereco: string | null;
  contratante_municipio: string | null;
  contratante_estado: string | null;
  contratada_razao_social: string | null;
  contratada_cnpj: string | null;
  contratada_endereco: string | null;
  contratada_municipio: string | null;
  contratada_estado: string | null;
  contrato_numero: string | null;
  contrato_data_assinatura: string | null;
  contrato_objeto: string | null;
  contrato_valor: number | null;
  contrato_modalidade: string | null;
  processo_licitatorio: string | null;
  responsavel_tecnico_nome: string | null;
  responsavel_tecnico_crea: string | null;
  responsavel_tecnico_art: string | null;
  rodape_observacoes: string | null;
}

export interface DiarioPDFData {
  logoUrl: string | null;
  companyName: string;
  projectName: string;
  projectLocation: string | null;
  /** @deprecated mantido por compat — substituído pelo legal config */
  contractor: string | null;
  engineerName: string;
  entryDate: string;
  clima: string | null;
  equipePresente: number;
  observacaoGeral: string | null;
  items: DiaryItem[];
  correcoes: Correction[];
  photoUrls: string[];
  /** Fotos vinculadas a serviços específicos — geram a seção "Registro Fotográfico por Serviço" */
  photosByService?: Array<{
    macro_name: string;
    scope_name: string;
    macro_color: string;
    house_ids: number[];
    percentual_executado: number;
    photos: Array<{ url: string; legenda: string | null }>;
  }>;
  reportNumber: number | null;
  legal: LegalConfig | null;
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

function fmtCurrency(v: number | null) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try { return format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR }); } catch { return iso; }
}

/**
 * Renderiza a seção "Registro Fotográfico por Serviço".
 * Agrupa fotos por serviço executado, com contexto (etapa, casas, percentual).
 * Critério jurídico — usado tanto no template público quanto corporativo.
 */
async function renderPhotosByService(
  doc: jsPDF,
  data: DiarioPDFData,
  startY: number,
  opts: { font: "times" | "helvetica"; titleColor: number[]; }
): Promise<number> {
  if (!data.photosByService || data.photosByService.length === 0) return startY;
  const groups = data.photosByService.filter(g => g.photos.length > 0);
  if (groups.length === 0) return startY;

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  let y = startY;

  if (y > pageH - 60) { doc.addPage(); y = margin; }
  doc.setFont(opts.font, "bold");
  doc.setFontSize(10);
  doc.setTextColor(opts.titleColor[0], opts.titleColor[1], opts.titleColor[2]);
  const totalFotos = groups.reduce((s, g) => s + g.photos.length, 0);
  doc.text(`REGISTRO FOTOGRÁFICO POR SERVIÇO (${totalFotos})`, margin, y);
  y += 5;

  for (const group of groups) {
    if (y > pageH - 50) { doc.addPage(); y = margin; }
    // Cabeçalho do grupo (faixa colorida + título)
    try {
      const c = group.macro_color || "#6b7280";
      const r = parseInt(c.slice(1, 3), 16);
      const g = parseInt(c.slice(3, 5), 16);
      const b = parseInt(c.slice(5, 7), 16);
      doc.setFillColor(r, g, b);
    } catch { doc.setFillColor(107, 114, 128); }
    doc.rect(margin, y, 2, 6, "F");

    doc.setFont(opts.font, "bold");
    doc.setFontSize(9);
    doc.setTextColor(20);
    doc.text(`${group.macro_name} · ${group.scope_name}`, margin + 4, y + 4);
    doc.setFont(opts.font, "normal");
    doc.setFontSize(7);
    doc.setTextColor(80);
    const houses = group.house_ids.sort((a, b) => a - b).map(h => String(h).padStart(2, "0")).join(", ");
    doc.text(`Casas: ${houses} · ${group.percentual_executado}% executado · ${group.photos.length} foto(s)`, margin + 4, y + 8);
    y += 11;

    // Grid 3 colunas
    const cols = 3, gap = 3;
    const cellW = (pageW - margin * 2 - gap * (cols - 1)) / cols;
    const cellH = cellW * 0.75;
    let col = 0;
    for (const photo of group.photos) {
      if (y + cellH > pageH - 20) { doc.addPage(); y = margin; }
      const dataUrl = await loadImageAsDataUrl(photo.url);
      const x = margin + col * (cellW + gap);
      if (dataUrl) {
        try {
          doc.addImage(dataUrl, "JPEG", x, y, cellW, cellH);
          doc.setDrawColor(120);
          doc.setLineWidth(0.2);
          doc.rect(x, y, cellW, cellH);
        } catch { /* */ }
      }
      col++;
      if (col >= cols) { col = 0; y += cellH + gap; }
    }
    if (col !== 0) { y += cellH + gap; col = 0; }
    y += 2;
  }
  return y;
}

// ════════════════════════════════════════════════════════════════════
// TEMPLATE 1 — ÓRGÃO PÚBLICO (formal)
// ════════════════════════════════════════════════════════════════════
async function renderOrgaoPublico(
  doc: jsPDF, data: DiarioPDFData, config: DiarioPDFConfig
): Promise<void> {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  let y = margin;

  const dateObj = parseISO(data.entryDate);
  const dateFmt = format(dateObj, "dd/MM/yyyy", { locale: ptBR });
  const weekday = format(dateObj, "EEEE", { locale: ptBR });
  const legal = data.legal;

  // ─── Faixa institucional (cabeçalho) ─────────────────────────────
  doc.setFillColor(30, 41, 59); // slate-800
  doc.rect(0, 0, pageW, 26, "F");

  // Logo
  if (config.showLogo && data.logoUrl) {
    const dataUrl = await loadImageAsDataUrl(data.logoUrl);
    if (dataUrl) {
      try { doc.addImage(dataUrl, "PNG", margin, 5, 30, 16); } catch { /* */ }
    }
  }

  // Bloco direito (faixa)
  doc.setTextColor(255, 255, 255);
  doc.setFont("times", "bold");
  doc.setFontSize(13);
  doc.text("RELATÓRIO DIÁRIO DE OBRA", pageW - margin, 12, { align: "right" });
  doc.setFont("times", "normal");
  doc.setFontSize(8);
  doc.text("(Documento de comprovação de execução contratual)", pageW - margin, 17, { align: "right" });
  doc.text(`RDO Nº ${data.reportNumber ?? "—"}  ·  ${dateFmt}  ·  ${weekday}`, pageW - margin, 22, { align: "right" });

  y = 32;

  // ─── Identificação Jurídica (Contratante / Contratada / Contrato) ─
  if (config.showLegalHeader && legal) {
    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { font: "times", fontSize: 8.5, cellPadding: 2, lineColor: [80, 80, 80], lineWidth: 0.2, textColor: [20, 20, 20] },
      headStyles: { fillColor: [226, 232, 240], textColor: [20, 20, 20], fontStyle: "bold", halign: "center" },
      margin: { left: margin, right: margin },
      head: [[{ content: "IDENTIFICAÇÃO DAS PARTES E DO CONTRATO", colSpan: 4 }]],
      body: [
        [
          { content: "CONTRATANTE", styles: { fontStyle: "bold", fillColor: [248, 250, 252] } },
          { content: [
              legal.contratante_nome || "—",
              legal.contratante_orgao ? `Órgão: ${legal.contratante_orgao}` : null,
              legal.contratante_cnpj_cpf ? `CNPJ/CPF: ${legal.contratante_cnpj_cpf}` : null,
              [legal.contratante_endereco, legal.contratante_municipio, legal.contratante_estado].filter(Boolean).join(" — "),
              `Tipo: ${legal.contratante_tipo === "publico" ? "Pessoa Jurídica de Direito Público" : legal.contratante_tipo === "misto" ? "Misto / PPP" : "Pessoa Jurídica de Direito Privado"}`,
            ].filter(Boolean).join("\n"), colSpan: 3 },
        ],
        [
          { content: "CONTRATADA", styles: { fontStyle: "bold", fillColor: [248, 250, 252] } },
          { content: [
              legal.contratada_razao_social || data.companyName,
              legal.contratada_cnpj ? `CNPJ: ${legal.contratada_cnpj}` : null,
              [legal.contratada_endereco, legal.contratada_municipio, legal.contratada_estado].filter(Boolean).join(" — "),
            ].filter(Boolean).join("\n"), colSpan: 3 },
        ],
        [
          { content: "CONTRATO", styles: { fontStyle: "bold", fillColor: [248, 250, 252] } },
          `Nº ${legal.contrato_numero || "—"}`,
          { content: `Assinatura: ${fmtDate(legal.contrato_data_assinatura)}` },
          { content: `Valor: ${fmtCurrency(legal.contrato_valor)}` },
        ],
        [
          { content: "OBJETO", styles: { fontStyle: "bold", fillColor: [248, 250, 252] } },
          { content: legal.contrato_objeto || "—", colSpan: 3 },
        ],
        [
          { content: "MODALIDADE", styles: { fontStyle: "bold", fillColor: [248, 250, 252] } },
          { content: legal.contrato_modalidade || "—" },
          { content: "PROCESSO", styles: { fontStyle: "bold", fillColor: [248, 250, 252] } },
          { content: legal.processo_licitatorio || "—" },
        ],
        [
          { content: "RESP. TÉCNICO", styles: { fontStyle: "bold", fillColor: [248, 250, 252] } },
          { content: legal.responsavel_tecnico_nome || "—" },
          { content: `${legal.responsavel_tecnico_crea || "—"}` },
          { content: `ART/RRT: ${legal.responsavel_tecnico_art || "—"}` },
        ],
        [
          { content: "OBRA", styles: { fontStyle: "bold", fillColor: [248, 250, 252] } },
          { content: data.projectName, colSpan: 2 },
          { content: `Local: ${data.projectLocation || "—"}` },
        ],
        [
          { content: "RESPONSÁVEL DO DIA", styles: { fontStyle: "bold", fillColor: [248, 250, 252] } },
          { content: data.engineerName, colSpan: 3 },
        ],
      ] as any,
      columnStyles: { 0: { cellWidth: 35 } },
    });
    y = (doc as any).lastAutoTable.finalY + 4;
  }

  // ─── Condições do Dia (clima + equipe) ───────────────────────────
  if (config.showWeather || config.showTeam) {
    const body: any[] = [];
    if (config.showWeather) {
      body.push([
        { content: "CONDIÇÕES METEOROLÓGICAS", styles: { fontStyle: "bold", fillColor: [248, 250, 252] } },
        data.clima ? (CLIMA_LABELS[data.clima] || data.clima) : "—",
      ]);
    }
    if (config.showTeam) {
      body.push([
        { content: "EFETIVO MOBILIZADO", styles: { fontStyle: "bold", fillColor: [248, 250, 252] } },
        `${data.equipePresente} colaborador(es) presente(s)`,
      ]);
    }
    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { font: "times", fontSize: 8.5, cellPadding: 2, lineColor: [80, 80, 80], lineWidth: 0.2 },
      headStyles: { fillColor: [226, 232, 240], textColor: [20, 20, 20], fontStyle: "bold", halign: "center" },
      head: [[{ content: "CONDIÇÕES DO DIA", colSpan: 2 }]],
      body,
      columnStyles: { 0: { cellWidth: 60 } },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 4;
  }

  // ─── Atividades Executadas ───────────────────────────────────────
  if (config.showServices) {
    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { font: "times", fontSize: 8, cellPadding: 2, lineColor: [80, 80, 80], lineWidth: 0.2, valign: "middle" },
      headStyles: { fillColor: [226, 232, 240], textColor: [20, 20, 20], fontStyle: "bold" },
      head: [
        [{ content: `SERVIÇOS EXECUTADOS NO DIA (${data.items.length})`, colSpan: 4, styles: { halign: "center" } }],
        ["Etapa / Serviço", "Unidade(s)", "% Executado", "Status"],
      ],
      body: data.items.length ? data.items.map(item => [
        `${item.macro_name} — ${item.scope_name}${item.observacao ? `\nObs.: ${item.observacao}` : ""}`,
        item.house_ids.sort((a, b) => a - b).map(h => String(h).padStart(2, "0")).join(", "),
        `${item.percentual_executado}%`,
        item.percentual_executado >= 100 ? "Concluído" : "Em andamento",
      ]) : [[{ content: "Nenhum serviço lançado neste dia.", colSpan: 4, styles: { halign: "center", textColor: [100, 100, 100] } }] as any],
      columnStyles: {
        0: { cellWidth: "auto" },
        1: { cellWidth: 50 },
        2: { cellWidth: 22, halign: "center" },
        3: { cellWidth: 28, halign: "center" },
      },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 4;
  }

  // ─── Observações Gerais ──────────────────────────────────────────
  if (config.showObservations && data.observacaoGeral) {
    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { font: "times", fontSize: 9, cellPadding: 3, lineColor: [80, 80, 80], lineWidth: 0.2 },
      headStyles: { fillColor: [226, 232, 240], textColor: [20, 20, 20], fontStyle: "bold", halign: "center" },
      head: [["OBSERVAÇÕES GERAIS / OCORRÊNCIAS"]],
      body: [[data.observacaoGeral]],
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 4;
  }

  // ─── Correções (governança) ──────────────────────────────────────
  if (config.showCorrections && data.correcoes.length > 0) {
    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { font: "times", fontSize: 8, cellPadding: 2, lineColor: [120, 80, 0], lineWidth: 0.2 },
      headStyles: { fillColor: [254, 243, 199], textColor: [120, 53, 15], fontStyle: "bold", halign: "center" },
      head: [[`REGISTROS DE CORREÇÃO (${data.correcoes.length}) — Governança`]],
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
    y = (doc as any).lastAutoTable.finalY + 4;
  }

  // ─── Registro Fotográfico por Serviço (auditoria) ────────────────
  if (config.showPhotos) {
    y = await renderPhotosByService(doc, data, y, { font: "times", titleColor: [20, 20, 20] });
  }

  // ─── Fotos avulsas ───────────────────────────────────────────────
  if (config.showPhotos && data.photoUrls.length > 0) {
    if (y > pageH - 60) { doc.addPage(); y = margin; }
    doc.setFont("times", "bold");
    doc.setFontSize(10);
    doc.setTextColor(20);
    doc.text(`REGISTRO FOTOGRÁFICO (${data.photoUrls.length})`, margin, y);
    y += 4;

    const cols = 3;
    const gap = 3;
    const cellW = (pageW - margin * 2 - gap * (cols - 1)) / cols;
    const cellH = cellW * 0.75;
    let col = 0;
    for (const url of data.photoUrls) {
      if (y + cellH > pageH - 20) { doc.addPage(); y = margin; }
      const dataUrl = await loadImageAsDataUrl(url);
      if (dataUrl) {
        try {
          const x = margin + col * (cellW + gap);
          doc.addImage(dataUrl, "JPEG", x, y, cellW, cellH);
          doc.setDrawColor(80);
          doc.rect(x, y, cellW, cellH);
        } catch { /* */ }
      }
      col++;
      if (col >= cols) { col = 0; y += cellH + gap; }
    }
    if (col !== 0) y += cellH + gap;
  }

  // ─── Assinaturas ─────────────────────────────────────────────────
  if (config.showSignatures) {
    if (y > pageH - 50) { doc.addPage(); y = margin; }
    else y += 8;
    const signW = (pageW - margin * 2 - 10) / 2;
    doc.setDrawColor(30);
    doc.setLineWidth(0.4);
    doc.line(margin, y + 16, margin + signW, y + 16);
    doc.line(margin + signW + 10, y + 16, margin + signW * 2 + 10, y + 16);
    doc.setFont("times", "bold");
    doc.setFontSize(9);
    doc.setTextColor(30);
    doc.text("Responsável Técnico (Contratada)", margin + signW / 2, y + 20, { align: "center" });
    doc.text("Fiscal / Contratante", margin + signW + 10 + signW / 2, y + 20, { align: "center" });
    doc.setFont("times", "normal");
    doc.setFontSize(8);
    const respLine = legal?.responsavel_tecnico_nome
      ? `${legal.responsavel_tecnico_nome} — ${legal.responsavel_tecnico_crea || ""}`
      : data.engineerName;
    doc.text(respLine, margin + signW / 2, y + 25, { align: "center" });
    if (legal?.responsavel_tecnico_art) {
      doc.text(`ART/RRT: ${legal.responsavel_tecnico_art}`, margin + signW / 2, y + 29, { align: "center" });
    }
    y += 32;
  }

  // ─── Rodapé legal + paginação ────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(150);
    doc.setLineWidth(0.2);
    doc.line(margin, pageH - 14, pageW - margin, pageH - 14);
    doc.setFont("times", "italic");
    doc.setFontSize(7);
    doc.setTextColor(80);
    const rodapeLines: string[] = [];
    if (legal?.contrato_numero) rodapeLines.push(`Contrato nº ${legal.contrato_numero}`);
    if (legal?.processo_licitatorio) rodapeLines.push(`Proc. ${legal.processo_licitatorio}`);
    if (legal?.rodape_observacoes) rodapeLines.push(legal.rodape_observacoes);
    const rodapeBase = rodapeLines.join("  ·  ") || data.companyName;
    doc.text(rodapeBase, margin, pageH - 9);
    doc.text(`RDO ${data.reportNumber ?? "—"} · ${dateFmt} · Página ${i}/${pageCount}`, pageW - margin, pageH - 9, { align: "right" });
    // Marca ObraMap (identidade do software) — rodapé padrão obrigatório
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(37, 99, 235);
    doc.text("© 2026 ObraMap | Engenharia Digital", pageW / 2, pageH - 4, { align: "center" });
  }
}

// ════════════════════════════════════════════════════════════════════
// TEMPLATE 2 — CORPORATIVO MODERNO
// ════════════════════════════════════════════════════════════════════
async function renderCorporativoModerno(
  doc: jsPDF, data: DiarioPDFData, config: DiarioPDFConfig
): Promise<void> {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  let y = margin;

  const dateObj = parseISO(data.entryDate);
  const dateFmt = format(dateObj, "dd/MM/yyyy", { locale: ptBR });
  const weekday = format(dateObj, "EEEE", { locale: ptBR });
  const legal = data.legal;

  // Faixa colorida superior
  doc.setFillColor(37, 99, 235); // blue-600
  doc.rect(0, 0, pageW, 4, "F");
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 4, pageW, 28, "F");

  if (config.showLogo && data.logoUrl) {
    const dataUrl = await loadImageAsDataUrl(data.logoUrl);
    if (dataUrl) {
      try { doc.addImage(dataUrl, "PNG", margin, 8, 28, 18); } catch { /* */ }
    }
  }

  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Relatório Diário de Obra", pageW - margin, 14, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`${data.projectName}`, pageW - margin, 20, { align: "right" });
  doc.setFontSize(8);
  doc.setTextColor(180, 200, 230);
  doc.text(`RDO ${data.reportNumber ?? "—"}  ·  ${dateFmt}  ·  ${weekday}`, pageW - margin, 26, { align: "right" });

  y = 38;

  // KPIs do dia (4 cards)
  if (config.showWeather || config.showTeam) {
    const kpis = [
      { label: "Equipe", value: `${data.equipePresente}`, sub: "presentes" },
      { label: "Serviços", value: `${data.items.length}`, sub: `${data.items.filter(i => i.percentual_executado >= 100).length} concl.` },
      { label: "Casas", value: `${new Set(data.items.flatMap(i => i.house_ids)).size}`, sub: "trabalhadas" },
      { label: "Clima", value: data.clima ? (CLIMA_LABELS[data.clima]?.split(" ")[0] || "—") : "—", sub: "do dia" },
    ];
    const kpiW = (pageW - margin * 2 - 9) / 4;
    kpis.forEach((k, idx) => {
      const x = margin + idx * (kpiW + 3);
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(x, y, kpiW, 22, 2, 2, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(k.label.toUpperCase(), x + 3, y + 5);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(15, 23, 42);
      doc.text(k.value, x + 3, y + 13);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(k.sub, x + 3, y + 19);
    });
    y += 26;
  }

  // Identificação Jurídica (compacta)
  if (config.showLegalHeader && legal) {
    autoTable(doc, {
      startY: y,
      theme: "plain",
      styles: { font: "helvetica", fontSize: 8, cellPadding: 2, textColor: [30, 41, 59] },
      bodyStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin, right: margin },
      head: [[{ content: "IDENTIFICAÇÃO CONTRATUAL", colSpan: 4, styles: { fontStyle: "bold", fillColor: [37, 99, 235], textColor: [255, 255, 255], halign: "left", cellPadding: 3 } }]],
      body: [
        [
          { content: "Contratante", styles: { fontStyle: "bold", textColor: [100, 116, 139] } },
          { content: `${legal.contratante_nome || "—"}${legal.contratante_cnpj_cpf ? `\n${legal.contratante_cnpj_cpf}` : ""}` },
          { content: "Contratada", styles: { fontStyle: "bold", textColor: [100, 116, 139] } },
          { content: `${legal.contratada_razao_social || data.companyName}${legal.contratada_cnpj ? `\n${legal.contratada_cnpj}` : ""}` },
        ],
        [
          { content: "Contrato", styles: { fontStyle: "bold", textColor: [100, 116, 139] } },
          { content: `Nº ${legal.contrato_numero || "—"} · ${fmtDate(legal.contrato_data_assinatura)}` },
          { content: "Resp. Técnico", styles: { fontStyle: "bold", textColor: [100, 116, 139] } },
          { content: `${legal.responsavel_tecnico_nome || data.engineerName}${legal.responsavel_tecnico_crea ? ` · ${legal.responsavel_tecnico_crea}` : ""}` },
        ],
        ...(legal.contrato_objeto ? [[
          { content: "Objeto", styles: { fontStyle: "bold", textColor: [100, 116, 139] } },
          { content: legal.contrato_objeto, colSpan: 3 },
        ]] : []),
      ] as any,
      columnStyles: { 0: { cellWidth: 25 }, 2: { cellWidth: 25 } },
    });
    y = (doc as any).lastAutoTable.finalY + 4;
  }

  // Atividades
  if (config.showServices) {
    autoTable(doc, {
      startY: y,
      theme: "striped",
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 2.5, valign: "middle" },
      headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      head: [[`Atividades (${data.items.length})`, "Casas", "%", "Status"]],
      body: data.items.length ? data.items.map(item => [
        `${item.macro_name} — ${item.scope_name}${item.observacao ? `\n${item.observacao}` : ""}`,
        item.house_ids.sort((a, b) => a - b).map(h => String(h).padStart(2, "0")).join(", "),
        `${item.percentual_executado}%`,
        item.percentual_executado >= 100 ? "Concluído" : "Em andamento",
      ]) : [[{ content: "Nenhum serviço lançado neste dia.", colSpan: 4, styles: { halign: "center", textColor: [100, 116, 139] } }] as any],
      columnStyles: {
        0: { cellWidth: "auto" },
        1: { cellWidth: 50 },
        2: { cellWidth: 18, halign: "center" },
        3: { cellWidth: 28, halign: "center" },
      },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 4;
  }

  if (config.showObservations && data.observacaoGeral) {
    autoTable(doc, {
      startY: y,
      theme: "plain",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 3, fillColor: [248, 250, 252] },
      head: [[{ content: "Observações Gerais", styles: { fontStyle: "bold", fillColor: [37, 99, 235], textColor: [255, 255, 255], cellPadding: 2.5 } }]],
      body: [[data.observacaoGeral]],
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 4;
  }

  if (config.showCorrections && data.correcoes.length > 0) {
    autoTable(doc, {
      startY: y,
      theme: "plain",
      styles: { font: "helvetica", fontSize: 8, cellPadding: 2.5, fillColor: [254, 243, 199] },
      head: [[{ content: `Correções aplicadas (${data.correcoes.length})`, styles: { fontStyle: "bold", fillColor: [245, 158, 11], textColor: [255, 255, 255] } }]],
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
    y = (doc as any).lastAutoTable.finalY + 4;
  }

  // Registro Fotográfico por Serviço (auditoria) — corporativo moderno
  if (config.showPhotos) {
    y = await renderPhotosByService(doc, data, y, { font: "helvetica", titleColor: [15, 23, 42] });
  }

  if (config.showPhotos && data.photoUrls.length > 0) {
    if (y > pageH - 60) { doc.addPage(); y = margin; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(`Fotos (${data.photoUrls.length})`, margin, y);
    y += 4;
    const cols = 3, gap = 3;
    const cellW = (pageW - margin * 2 - gap * (cols - 1)) / cols;
    const cellH = cellW * 0.75;
    let col = 0;
    for (const url of data.photoUrls) {
      if (y + cellH > pageH - 20) { doc.addPage(); y = margin; }
      const dataUrl = await loadImageAsDataUrl(url);
      if (dataUrl) {
        try {
          const x = margin + col * (cellW + gap);
          doc.addImage(dataUrl, "JPEG", x, y, cellW, cellH);
        } catch { /* */ }
      }
      col++;
      if (col >= cols) { col = 0; y += cellH + gap; }
    }
    if (col !== 0) y += cellH + gap;
  }

  if (config.showSignatures) {
    if (y > pageH - 50) { doc.addPage(); y = margin; } else y += 8;
    const signW = (pageW - margin * 2 - 10) / 2;
    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.3);
    doc.line(margin, y + 16, margin + signW, y + 16);
    doc.line(margin + signW + 10, y + 16, margin + signW * 2 + 10, y + 16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text("Responsável Técnico", margin + signW / 2, y + 20, { align: "center" });
    doc.text("Fiscal / Contratante", margin + signW + 10 + signW / 2, y + 20, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    const respLine = legal?.responsavel_tecnico_nome || data.engineerName;
    doc.text(respLine, margin + signW / 2, y + 24, { align: "center" });
  }

  // Rodapé
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFillColor(37, 99, 235);
    doc.rect(0, pageH - 4, pageW, 4, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(legal?.rodape_observacoes || data.companyName, margin, pageH - 8);
    doc.text(`RDO ${data.reportNumber ?? "—"} · ${dateFmt} · ${i}/${pageCount}`, pageW - margin, pageH - 8, { align: "right" });
    // Marca ObraMap (identidade do software) — rodapé padrão obrigatório
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text("© 2026 ObraMap | Engenharia Digital", pageW / 2, pageH - 1, { align: "center" });
  }
}

// ════════════════════════════════════════════════════════════════════
// ENTRY POINT
// ════════════════════════════════════════════════════════════════════
export async function generateDiarioPDF(
  data: DiarioPDFData,
  config: DiarioPDFConfig = DEFAULT_PDF_CONFIG
): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const tpl = data.legal?.pdf_template || "orgao_publico";
  if (tpl === "corporativo_moderno") {
    await renderCorporativoModerno(doc, data, config);
  } else {
    await renderOrgaoPublico(doc, data, config);
  }

  const dateFmt = format(parseISO(data.entryDate), "dd-MM-yyyy", { locale: ptBR });
  doc.save(`RDO_${data.projectName.replace(/[^a-zA-Z0-9]/g, "_")}_${dateFmt}.pdf`);
}
