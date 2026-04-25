import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { DiarioLegalConfigPanel } from "@/components/diario/DiarioLegalConfigPanel";
import { ProjectSelector } from "@/components/ProjectSelector";
import { useConstruction } from "@/contexts/ConstructionContext";

export default function DiarioConfigPage() {
  const navigate = useNavigate();
  const { currentProject } = useConstruction();

  return (
    <div className="container max-w-5xl py-6 space-y-4 px-3 sm:px-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl sm:text-2xl font-bold">Documentação Legal do RDO</h1>
      </div>
      {!currentProject && <ProjectSelector />}
      <DiarioLegalConfigPanel />
    </div>
  );
}
