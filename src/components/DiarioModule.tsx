import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Calendar, FileSignature, ClipboardEdit, Images } from "lucide-react";
import DiarioObraView from "./DiarioObraView";
import { DiarioCalendarView } from "./diario/DiarioCalendarView";
import { DiarioLegalConfigPanel } from "./diario/DiarioLegalConfigPanel";
import { GeneralPhotosPanel } from "./diario/GeneralPhotosPanel";

type TabKey = "calendario" | "editor" | "fotos" | "config";

/**
 * Módulo principal do Diário de Obras.
 * Abas: Calendário (visão mensal), Editor (RDO), Fotos Gerais (sem casa) e Configuração.
 */
export function DiarioModule() {
  const restored = (() => {
    try {
      return JSON.parse(sessionStorage.getItem("obramap_diario_tab") || "null") as { tab?: TabKey; selectedDate?: string | null } | null;
    } catch {
      return null;
    }
  })();
  const [tab, setTab] = useState<TabKey>(restored?.tab || "calendario");
  const [selectedDate, setSelectedDate] = useState<string | null>(restored?.selectedDate || null);

  const setPersistedTab = (nextTab: TabKey, nextDate = selectedDate) => {
    setTab(nextTab);
    try { sessionStorage.setItem("obramap_diario_tab", JSON.stringify({ tab: nextTab, selectedDate: nextDate })); } catch { /* noop */ }
  };

  const openDay = (dateISO: string) => {
    setSelectedDate(dateISO);
    setPersistedTab("editor", dateISO);
  };

  const backToCalendar = () => {
    setPersistedTab("calendario");
  };

  return (
    <div className="px-2 sm:px-4 lg:px-6 py-3 sm:py-4 w-full max-w-full min-w-0 overflow-x-hidden">
      <Tabs value={tab} onValueChange={(v) => setPersistedTab(v as TabKey)} className="w-full">
        <TabsList className="grid grid-cols-4 w-full max-w-3xl mb-4 h-auto">
          <TabsTrigger value="calendario" className="flex items-center gap-1.5 py-2 text-xs sm:text-sm">
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">Calendário</span>
            <span className="sm:hidden">Calend.</span>
          </TabsTrigger>
          <TabsTrigger value="editor" className="flex items-center gap-1.5 py-2 text-xs sm:text-sm">
            <ClipboardEdit className="h-4 w-4" />
            <span>Editor</span>
          </TabsTrigger>
          <TabsTrigger value="fotos" className="flex items-center gap-1.5 py-2 text-xs sm:text-sm">
            <Images className="h-4 w-4" />
            <span className="hidden sm:inline">Fotos Gerais</span>
            <span className="sm:hidden">Fotos</span>
          </TabsTrigger>
          <TabsTrigger value="config" className="flex items-center gap-1.5 py-2 text-xs sm:text-sm">
            <FileSignature className="h-4 w-4" />
            <span className="hidden sm:inline">Configuração</span>
            <span className="sm:hidden">Config.</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendario" className="mt-0">
          <DiarioCalendarView onSelectDay={openDay} />
        </TabsContent>

        <TabsContent value="editor" className="mt-0">
          <DiarioObraView
            initialDate={selectedDate || undefined}
            onBack={backToCalendar}
            hideLegalConfigAlert
          />
        </TabsContent>

        <TabsContent value="fotos" className="mt-0">
          <GeneralPhotosPanel />
        </TabsContent>

        <TabsContent value="config" className="mt-0">
          <DiarioLegalConfigPanel embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
}
