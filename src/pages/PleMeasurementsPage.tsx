import { usePleData } from "@/hooks/usePleData";
import { PleModuleView } from "@/components/ple/PleModuleView";

export default function PleMeasurementsPage() {
  const pleData = usePleData();
  return <PleModuleView {...pleData} />;
}
