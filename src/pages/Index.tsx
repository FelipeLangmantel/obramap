import React, { useState, useEffect, useRef } from "react";
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

  const handlePrintMap = async () => {
    if (!printAreaRef.current || !currentProject) return;
    
    const { default: html2canvasLib } = await import("html2canvas");
    const { default: jsPDFLib } = await import("jspdf");
    
    try {
      // Force opaque backgrounds for crisp PDF output
      const printEl = printAreaRef.current;
      const originalStyles: { el: HTMLElement; bg: string; opacity: string; boxShadow: string }[] = [];
      
      // Make all child elements fully opaque with solid backgrounds
      printEl.querySelectorAll<HTMLElement>('*').forEach(el => {
        const computed = getComputedStyle(el);
        const bg = computed.backgroundColor;
        const opacity = el.style.opacity;
        const boxShadow = el.style.boxShadow;
        
        // Convert any rgba with alpha < 1 to fully opaque
        const rgbaMatch = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (rgbaMatch && rgbaMatch[4] && parseFloat(rgbaMatch[4]) < 1) {
          originalStyles.push({ el, bg: el.style.backgroundColor, opacity, boxShadow });
          // Blend with white background for solid color
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
        backgroundColor: '#ffffff',
        imageTimeout: 0,
        removeContainer: true,
      });

      // Restore original styles
      originalStyles.forEach(({ el, bg, opacity, boxShadow }) => {
        el.style.backgroundColor = bg;
        el.style.opacity = opacity;
        el.style.boxShadow = boxShadow;
      });

      // Paper sizes in mm (landscape)
      const paperSizes: { name: string; w: number; h: number }[] = [
        { name: "A4", w: 297, h: 210 },
        { name: "A3", w: 420, h: 297 },
        { name: "A2", w: 594, h: 420 },
        { name: "A1", w: 841, h: 594 },
        { name: "A0", w: 1189, h: 841 },
      ];

      const margin = 10;
      const headerH = 15;
      const footerH = 10;
      const imgAspect = canvas.width / canvas.height;

      // Find the smallest paper size that fits everything on one page
      let selectedPaper = paperSizes[paperSizes.length - 1]; // default A0
      for (const paper of paperSizes) {
        const availW = paper.w - 2 * margin;
        const availH = paper.h - 2 * margin - headerH - footerH;
        let fitW = availW;
        let fitH = fitW / imgAspect;
        if (fitH > availH) {
          fitH = availH;
          fitW = fitH * imgAspect;
        }
        // Accept if the scale is reasonable (at least 50% of original quality)
        if (fitW <= availW && fitH <= availH) {
          selectedPaper = paper;
          break;
        }
      }

      const pdf = new jsPDFLib("l", "mm", [selectedPaper.w, selectedPaper.h]);
      const pageW = selectedPaper.w;
      const pageH = selectedPaper.h;

      // Header
      pdf.setFontSize(14);
      pdf.setFont("helvetica", "bold");
      pdf.text(`Mapa de Obras - ${currentProject.name}`, margin, margin + 6);
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");
      pdf.text(`Gerado em: ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}`, pageW - margin, margin + 6, { align: "right" });

      const imgData = canvas.toDataURL("image/jpeg", 1.0);
      const availW = pageW - 2 * margin;
      const availH = pageH - 2 * margin - headerH - footerH;
      
      let imgW = availW;
      let imgH = imgW / imgAspect;
      if (imgH > availH) {
        imgH = availH;
        imgW = imgH * imgAspect;
      }

      const imgX = margin + (availW - imgW) / 2;
      pdf.addImage(imgData, "JPEG", imgX, margin + headerH, imgW, imgH);

      // Footer with paper size
      pdf.setFontSize(7);
      pdf.setTextColor(150);
      pdf.text(`Folha ${selectedPaper.name} (${selectedPaper.w}×${selectedPaper.h}mm) - Paisagem`, margin, pageH - 5);
      pdf.text(`Página 1 de 1`, pageW / 2, pageH - 5, { align: "center" });
      pdf.text(`ObraMap`, pageW - margin, pageH - 5, { align: "right" });

      pdf.save(`mapa_obras_${currentProject.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.pdf`);
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
                        Imprimir PDF
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
