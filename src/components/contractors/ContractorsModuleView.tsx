import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Building2, FileText, Link2 } from "lucide-react";
import { useContractors } from "@/hooks/useContractors";
import { ContractorRegistrationTab } from "./ContractorRegistrationTab";
import { ContractorContractsTab } from "./ContractorContractsTab";
import { ContractorMeasurementsTab } from "./ContractorMeasurementsTab";
import { ContractorLinksTab } from "./ContractorLinksTab";
import type { ContractorContract } from "@/hooks/useContractors";

export default function ContractorsModuleView() {
  const data = useContractors();
  const [activeTab, setActiveTab] = useState("contracts");
  const [selectedContract, setSelectedContract] = useState<ContractorContract | null>(null);

  const handleSelectContract = (contract: ContractorContract) => {
    setSelectedContract(contract);
    setActiveTab("measurements");
  };

  if (selectedContract) {
    const contractor = data.contractors.find(c => c.id === selectedContract.contractor_id);
    return (
      <ContractorMeasurementsTab
        contract={selectedContract}
        contractorName={contractor?.name || "Empreiteiro"}
        fetchContractServices={data.fetchContractServices}
        fetchMeasurements={data.fetchMeasurements}
        createMeasurement={data.createMeasurement}
        fetchMeasurementItems={data.fetchMeasurementItems}
        saveMeasurementItem={data.saveMeasurementItem}
        approveMeasurement={data.approveMeasurement}
        updateContractService={data.updateContractService}
        deleteContractService={data.deleteContractService}
        recalcContractTotal={data.recalcContractTotal}
        onBack={() => setSelectedContract(null)}
      />
    );
  }

  return (
    <div className="h-full flex flex-col gap-3">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-fit h-9 flex-wrap">
          <TabsTrigger value="contracts" className="gap-1.5 text-xs px-3 h-7">
            <FileText className="h-3.5 w-3.5" /> Contratos
          </TabsTrigger>
          <TabsTrigger value="registration" className="gap-1.5 text-xs px-3 h-7">
            <Building2 className="h-3.5 w-3.5" /> Cadastro
          </TabsTrigger>
          <TabsTrigger value="links" className="gap-1.5 text-xs px-3 h-7">
            <Link2 className="h-3.5 w-3.5" /> Vínculos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contracts" className="flex-1 min-h-0 mt-3 overflow-auto">
          <ContractorContractsTab
            contractors={data.contractors}
            contracts={data.contracts}
            onCreateContract={data.createContract}
            fetchContractServices={data.fetchContractServices}
            addContractService={data.addContractService}
            recalcContractTotal={data.recalcContractTotal}
            onSelectContract={handleSelectContract}
          />
        </TabsContent>

        <TabsContent value="registration" className="flex-1 min-h-0 mt-3 overflow-auto">
          <ContractorRegistrationTab
            contractors={data.contractors}
            onCreateContractor={data.createContractor}
            onUpdateContractor={data.updateContractor}
          />
        </TabsContent>

        <TabsContent value="links" className="flex-1 min-h-0 mt-3 overflow-auto">
          <ContractorLinksTab
            contractors={data.contractors}
            contracts={data.contracts}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
