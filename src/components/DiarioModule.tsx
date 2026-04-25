import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Calendar, FileSignature, ClipboardEdit } from "lucide-react";
import DiarioObraView from "./DiarioObraView";
import { DiarioCalendarView } from "./diario/DiarioCalendarView";
import { DiarioLegalConfigPanel } from "./diario/DiarioLegalConfigPanel";

type TabKey = "calendario" | "editor" | "config";

/**
 * Módulo principal do Diário de Obras.
 * Apresenta três abas: Calendário (visão geral mensal), Editor do dia (RDO),
 * e Configuração (documentação legal). A tela inicial é o calendário.
 */
export function DiarioModule() {
  const [tab, setTab] = useState<TabKey>("calendario");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const openDay = (dateISO: string) => {
    setSelectedDate(dateISO);
    setTab("editor");
  };

  const backToCalendar = () => {
    setTab("calendario");
  };

  return (
    <div className="px-2 sm:px-4 lg:px-6 py-3 sm:py-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="w-full">
        <TabsList className="grid grid-cols-3 w-full max-w-2xl mb-4 h-auto">
          <TabsTrigger value="calendario" className="flex items-center gap-1.5 py-2 text-xs sm:text-sm">
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">Calendário</span>
            <span className="sm:hidden">Calend.</span>
          </TabsTrigger>
          <TabsTrigger value="editor" className="flex items-center gap-1.5 py-2 text-xs sm:text-sm">
            <ClipboardEdit className="h-4 w-4" />
            <span>Editor</span>
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

        <TabsContent value="config" className="mt-0">
          <DiarioLegalConfigPanel embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
}
