import React, { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { HomeDashboard } from "@/components/HomeDashboard";
import { StatsCards } from "@/components/StatsCards";
import { FilterBar } from "@/components/FilterBar";
import { Legend } from "@/components/Legend";
import { QuadrasGrid } from "@/components/QuadrasGrid";
import { HouseDetails } from "@/components/HouseDetails";
import { ChartsView } from "@/components/ChartsView";
import { WeeklyProductionView } from "@/components/WeeklyProductionView";
import { PlanningView } from "@/components/PlanningView";
import { ProjectCostsView } from "@/components/ProjectCostsView";
import { InteractiveMapView } from "@/components/InteractiveMapView";
import { Map3DView } from "@/components/Map3DView";
import { SuppliesJITView } from "@/components/supplies";
import { InputsManagementView } from "@/components/InputsManagementView";
import { SuppliersManagementView } from "@/components/SuppliersManagementView";
import { FinancialFlowView } from "@/components/FinancialFlowView";
import { BoardDecisionsView } from "@/components/BoardDecisionsView";
import DeliveryView from "@/components/DeliveryView";
import SmartPlanningView from "@/components/smart-planning/SmartPlanningView";
import { Loader2, Menu, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

// Sidebar trigger button - visible on all screen sizes
function SidebarTriggerButton() {
  return (
    <SidebarTrigger className="p-2 -ml-1 text-foreground hover:text-primary hover:bg-accent rounded-md transition-colors">
      <Menu className="h-6 w-6" />
    </SidebarTrigger>
  );
}

type ViewType = "home" | "map" | "charts" | "production" | "costs" | "planning" | "interactive-map" | "3d-map" | "supplies" | "inputs" | "suppliers" | "financial-flow" | "board-decisions" | "delivery" | "smart-planning";

/**
 * ✅ Index agora é puro - sem redirects
 * O SetupFlowGuard já garantiu que:
 * - Usuário está autenticado
 * - Tem acesso a esta rota
 */
function Index() {
  const [activeView, setActiveView] = useState<ViewType>("home");
  const location = useLocation();
  const { selectedHouse, isLoading, projects, currentProject, setCurrentProject } = useConstruction();
  const { canAccessProject } = useAuth();

  // ✅ Se navegou de outra rota com targetView no state, aplicar a view
  useEffect(() => {
    const state = location.state as { targetView?: ViewType } | null;
    if (state?.targetView) {
      setActiveView(state.targetView);
      // Limpar o state para não re-aplicar em re-renders
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  // ✅ Auto-seleciona a primeira obra acessível APENAS se não houver projeto atual
  // Usa ref para evitar múltiplas execuções
  const hasAutoSelectedRef = useRef(false);

  useEffect(() => {
    // ✅ Proteção contra execução duplicada
    if (hasAutoSelectedRef.current) return;
    if (isLoading) return;
    if (projects.length === 0) return;
    
    // ✅ Se já tem projeto atual válido, não faz nada
    if (currentProject && canAccessProject(currentProject.id)) {
      hasAutoSelectedRef.current = true;
      return;
    }

    const accessibleProjects = projects.filter((p) => canAccessProject(p.id));
    if (accessibleProjects.length === 0) {
      hasAutoSelectedRef.current = true;
      return;
    }

    // ✅ Seleciona apenas uma vez
    hasAutoSelectedRef.current = true;
    console.log("[INDEX] Auto-selecting first accessible project:", accessibleProjects[0].id);
    setCurrentProject(accessibleProjects[0].id);
  }, [isLoading, projects.length, currentProject?.id, canAccessProject, setCurrentProject]);

  const mapGridRef = useRef<HTMLDivElement>(null);
  const printAreaRef = useRef<HTMLDivElement>(null);

  // ═══════════════════════════════════════════
  // SISTEMA INTELIGENTE DE IMPRESSÃO DO MAPA
  // ═══════════════════════════════════════════

  const PAPER_SIZES = [
    { name: "A4", w: 297, h: 210, margin: 15 },
    { name: "A3", w: 420, h: 297, margin: 15 },
    { name: "A2", w: 594, h: 420, margin: 20 },
    { name: "A1", w: 841, h: 594, margin: 20 },
    { name: "A0", w: 1189, h: 841, margin: 25 },
  ] as const;

  const detectBestPaperSize = (totalHouses: number, quadrasCount: number) => {
    const housesPerQuadra = quadrasCount > 0 ? totalHouses / quadrasCount : totalHouses;
    const complexidade = housesPerQuadra * quadrasCount;

    if (complexidade <= 50) return PAPER_SIZES[0];  // A4
    if (complexidade <= 100) return PAPER_SIZES[1]; // A3
    if (complexidade <= 200) return PAPER_SIZES[2]; // A2
    if (complexidade <= 400) return PAPER_SIZES[3]; // A1
    return PAPER_SIZES[4]; // A0
  };

  const detectedPaper = useMemo(() => {
    if (!currentProject) return PAPER_SIZES[0];
    const totalHouses = currentProject.houses?.length || 0;
    const quadrasCount = currentProject.quadras?.length || 0;
    return detectBestPaperSize(totalHouses, quadrasCount);
  }, [currentProject]);

  const handlePrintMap = async () => {
    if (!printAreaRef.current || !currentProject) return;

    const { default: html2canvasLib } = await import("html2canvas");
    const { default: jsPDFLib } = await import("jspdf");

    try {
      const printEl = printAreaRef.current;
      const totalHouses = currentProject.houses?.length || 0;
      const quadrasCount = currentProject.quadras?.length || 0;

      const paper = detectBestPaperSize(totalHouses, quadrasCount);
      const margin = paper.margin;
      const headerH = 18;
      const footerH = 12;
      const availW = paper.w - 2 * margin;
      const availH = paper.h - 2 * margin - headerH - footerH;

      // Force opaque backgrounds
      const originalStyles: { el: HTMLElement; bg: string }[] = [];
      printEl.querySelectorAll<HTMLElement>("*").forEach((el) => {
        const computed = getComputedStyle(el);
        const bg = computed.backgroundColor;
        const rgbaMatch = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (rgbaMatch && rgbaMatch[4] && parseFloat(rgbaMatch[4]) < 1) {
          originalStyles.push({ el, bg: el.style.backgroundColor });
          const alpha = parseFloat(rgbaMatch[4]);
          const r = Math.round(parseInt(rgbaMatch[1]) * alpha + 255 * (1 - alpha));
          const g = Math.round(parseInt(rgbaMatch[2]) * alpha + 255 * (1 - alpha));
          const b = Math.round(parseInt(rgbaMatch[3]) * alpha + 255 * (1 - alpha));
          el.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
        }
      });

      const canvas = await html2canvasLib(printEl, {
        scale: 3,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        imageTimeout: 0,
        removeContainer: true,
      });

      originalStyles.forEach(({ el, bg }) => {
        el.style.backgroundColor = bg;
      });

      // Always fit on ONE page
      const imgAspect = canvas.width / canvas.height;
      let imgW = availW;
      let imgH = imgW / imgAspect;
      if (imgH > availH) {
        imgH = availH;
        imgW = imgH * imgAspect;
      }

      const pdf = new jsPDFLib("l", "mm", [paper.w, paper.h]);
      const now = new Date();
      const dateStr = now.toLocaleDateString("pt-BR");
      const timeStr = now.toLocaleTimeString("pt-BR");

      // Header
      pdf.setFillColor(26, 26, 26);
      pdf.rect(margin, margin, availW, headerH, "F");
      pdf.setFontSize(13);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(255, 255, 255);
      pdf.text(`Mapa de Obras — ${currentProject.name}`, margin + 5, margin + 7);
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      pdf.text(`${totalHouses} Casas em ${quadrasCount} Quadras`, margin + 5, margin + 13);
      pdf.text(`Formato: ${paper.name} Paisagem`, paper.w - margin - 5, margin + 7, { align: "right" });
      pdf.text(`${dateStr} às ${timeStr}`, paper.w - margin - 5, margin + 13, { align: "right" });

      // Image centered on single page
      const imgX = margin + (availW - imgW) / 2;
      const imgY = margin + headerH + (availH - imgH) / 2;
      const imgData = canvas.toDataURL("image/jpeg", 1.0);
      pdf.addImage(imgData, "JPEG", imgX, imgY, imgW, imgH);

      // Footer
      pdf.setDrawColor(200, 200, 200);
      pdf.line(margin, paper.h - margin - footerH, paper.w - margin, paper.h - margin - footerH);
      pdf.setFontSize(7);
      pdf.setTextColor(150, 150, 150);
      pdf.text(`© ${now.getFullYear()} ObraMap — Gestão Inteligente de Obras`, margin, paper.h - margin - 3);
      pdf.text(`Desenvolvido por Felipe Langmantel`, paper.w / 2, paper.h - margin - 3, { align: "center" });
      pdf.text(`${paper.name} (${paper.w}×${paper.h}mm)`, paper.w - margin, paper.h - margin - 3, { align: "right" });

      pdf.save(`mapa_obras_${currentProject.name.replace(/\s+/g, "_")}_${now.toISOString().slice(0, 10)}.pdf`);
    } catch (error) {
      console.error("Error generating PDF:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground text-base">Carregando obras...</p>
        </div>
      </div>
    );
  }

  const viewTitles: Record<ViewType, string> = {
    home: "Painel Inicial",
    map: "Mapa de Obras",
    "interactive-map": "Mapa Interativo",
    "3d-map": "Mapa 3D",
    charts: "Gráficos e Análises",
    production: "Produção Semanal",
    planning: "Planejamento Semanal",
    costs: "Custos da Obra",
    supplies: "Suprimentos",
    inputs: "Cadastro de Insumos",
    suppliers: "Cadastro de Fornecedores",
    "financial-flow": "Fluxo Financeiro",
    "board-decisions": "Painel Diretoria",
    delivery: "Entrega & Pós-Obra",
    "smart-planning": "Planejamento Inteligente"
  };

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="h-screen flex w-full overflow-hidden">
        <AppSidebar 
          activeView={activeView} 
          onViewChange={setActiveView}
        />
        
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
          {/* Top Header */}
          <header className="min-h-[56px] bg-card border-b border-border px-2 md:px-6 flex items-center gap-2 md:gap-4 shrink-0 flex-wrap py-2">
            <SidebarTriggerButton />
            <h2 className="text-sm md:text-xl font-semibold text-foreground whitespace-nowrap shrink-0 truncate max-w-[200px] md:max-w-none">
              {viewTitles[activeView]}
            </h2>
            
            <div className="flex-1 min-w-0" />
            
            <div className="flex items-center gap-1.5 md:gap-3 shrink-0 flex-wrap">
              {(activeView === "map" || activeView === "charts") && <FilterBar />}
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 p-4 md:p-5 lg:p-6 overflow-auto">
            {projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="text-6xl">🏗️</div>
                <h2 className="text-2xl font-semibold text-foreground">Nenhuma obra cadastrada</h2>
                <p className="text-muted-foreground text-center max-w-md text-base">
                  Clique em "Nova Obra" no menu lateral para cadastrar seu primeiro empreendimento.
                </p>
              </div>
            ) : (
              <div className="h-full flex flex-col">
                {activeView === "home" && (
                  <div className="flex-1">
                    <HomeDashboard onNavigateToProject={(view) => setActiveView(view as ViewType)} />
                  </div>
                )}

                {activeView === "map" && (
                  <div className="flex-1 flex flex-col gap-4">
                    <div ref={printAreaRef} className="flex flex-col gap-4">
                      <StatsCards />
                      <Legend />
                      <QuadrasGrid ref={mapGridRef} />
                    </div>
                    <div className="flex justify-end -mt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 shrink-0"
                        onClick={handlePrintMap}
                      >
                        <Printer className="w-4 h-4" />
                        Imprimir PDF ({detectedPaper.name})
                      </Button>
                    </div>
                    {selectedHouse && (
                      <div className="lg:sticky lg:top-0 lg:self-start lg:max-h-[calc(100vh-12rem)]">
                        <HouseDetails />
                      </div>
                    )}
                  </div>
                )}

                {activeView === "charts" && <StatsCards />}
                
                {activeView === "charts" && (
                  <div className="mt-4 flex-1">
                    <ChartsView />
                  </div>
                )}
                
                {activeView === "production" && (
                  <div className="flex-1">
                    <WeeklyProductionView />
                  </div>
                )}

                {activeView === "costs" && (
                  <div className="flex-1">
                    <ProjectCostsView />
                  </div>
                )}

                {activeView === "planning" && (
                  <div className="flex-1">
                    <PlanningView />
                  </div>
                )}

                {activeView === "interactive-map" && (
                  <div className="flex-1">
                    <InteractiveMapView />
                  </div>
                )}

                {activeView === "3d-map" && (
                  <div className="flex-1">
                    <Map3DView />
                  </div>
                )}

                {activeView === "supplies" && (
                  <div className="flex-1">
                    <SuppliesJITView />
                  </div>
                )}

                {activeView === "inputs" && (
                  <div className="flex-1">
                    <InputsManagementView />
                  </div>
                )}

                {activeView === "suppliers" && (
                  <div className="flex-1">
                    <SuppliersManagementView />
                  </div>
                )}

                {activeView === "financial-flow" && (
                  <div className="flex-1">
                    <FinancialFlowView />
                  </div>
                )}

                {activeView === "board-decisions" && (
                  <div className="flex-1">
                    <BoardDecisionsView />
                  </div>
                )}

                {activeView === "delivery" && (
                  <div className="flex-1">
                    <DeliveryView />
                  </div>
                )}

                {activeView === "smart-planning" && (
                  <div className="flex-1">
                    <SmartPlanningView />
                  </div>
                )}
              </div>
            )}
          </main>

          {/* Footer */}
          <footer className="py-2.5 text-center text-sm text-muted-foreground border-t border-border/50 bg-card/50 shrink-0">
            <p>Desenvolvido por <span className="font-semibold text-foreground">Felipe Langmantel</span></p>
          </footer>
        </div>
      </div>
    </SidebarProvider>
  );
}

export default Index;
