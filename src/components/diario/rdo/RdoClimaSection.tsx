import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Cloud, Sun, CloudRain } from "lucide-react";
import { cn } from "@/lib/utils";

export type ClimaTurno = "claro" | "nublado" | "chuvoso";
export type CondicaoTurno = "praticavel" | "impraticavel";

export interface ClimaState {
  noiteAtiva: boolean;
  climaManha: ClimaTurno;
  climaTarde: ClimaTurno;
  climaNoite: ClimaTurno | null;
  condicaoManha: CondicaoTurno;
  condicaoTarde: CondicaoTurno;
  condicaoNoite: CondicaoTurno | null;
  mmChuva: number | null;
}

interface Props {
  value: ClimaState;
  onChange: (v: ClimaState) => void;
  disabled?: boolean;
  autoBadge?: boolean;
}

const CLIMA_OPTIONS: { value: ClimaTurno; label: string; icon: any }[] = [
  { value: "claro", label: "Claro", icon: Sun },
  { value: "nublado", label: "Nublado", icon: Cloud },
  { value: "chuvoso", label: "Chuvoso", icon: CloudRain },
];

function TurnoRow({
  label, climaValue, onClimaChange, condValue, onCondChange, disabled,
}: {
  label: string;
  climaValue: ClimaTurno;
  onClimaChange: (c: ClimaTurno) => void;
  condValue: CondicaoTurno;
  onCondChange: (c: CondicaoTurno) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[100px_1fr_1fr] gap-3 items-center py-2 border-b last:border-0">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex flex-wrap gap-3">
        {CLIMA_OPTIONS.map(opt => {
          const Icon = opt.icon;
          const active = climaValue === opt.value;
          return (
            <label
              key={opt.value}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer text-xs border",
                active ? "bg-primary/10 border-primary text-primary" : "border-transparent",
                disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              <input
                type="radio"
                className="sr-only"
                checked={active}
                onChange={() => !disabled && onClimaChange(opt.value)}
              />
              <Icon className="h-3.5 w-3.5" />
              {opt.label}
            </label>
          );
        })}
      </div>
      <RadioGroup
        value={condValue}
        onValueChange={v => !disabled && onCondChange(v as CondicaoTurno)}
        className="flex gap-4"
        disabled={disabled}
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem value="praticavel" id={`prat-${label}`} />
          <Label htmlFor={`prat-${label}`} className="text-xs cursor-pointer">Praticável</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="impraticavel" id={`imp-${label}`} />
          <Label htmlFor={`imp-${label}`} className="text-xs cursor-pointer">Impraticável</Label>
        </div>
      </RadioGroup>
    </div>
  );
}

export function RdoClimaSection({ value, onChange, disabled }: Props) {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-start">
          <div className="space-y-0">
            <div className="grid grid-cols-1 md:grid-cols-[100px_1fr_1fr] gap-3 pb-2 border-b text-[11px] font-semibold uppercase text-muted-foreground">
              <span>Tempo</span><span></span><span>Condição da obra</span>
            </div>
            <TurnoRow
              label="Manhã"
              climaValue={value.climaManha}
              onClimaChange={c => onChange({ ...value, climaManha: c })}
              condValue={value.condicaoManha}
              onCondChange={c => onChange({ ...value, condicaoManha: c })}
              disabled={disabled}
            />
            <TurnoRow
              label="Tarde"
              climaValue={value.climaTarde}
              onClimaChange={c => onChange({ ...value, climaTarde: c })}
              condValue={value.condicaoTarde}
              onCondChange={c => onChange({ ...value, condicaoTarde: c })}
              disabled={disabled}
            />
            <div className="flex items-center gap-2 py-2">
              <Checkbox
                id="noite-ativa"
                checked={value.noiteAtiva}
                onCheckedChange={c => onChange({ ...value, noiteAtiva: !!c })}
                disabled={disabled}
              />
              <Label htmlFor="noite-ativa" className="text-xs cursor-pointer">Trabalho noturno</Label>
            </div>
            {value.noiteAtiva && (
              <TurnoRow
                label="Noite"
                climaValue={(value.climaNoite || "claro") as ClimaTurno}
                onClimaChange={c => onChange({ ...value, climaNoite: c })}
                condValue={(value.condicaoNoite || "praticavel") as CondicaoTurno}
                onCondChange={c => onChange({ ...value, condicaoNoite: c })}
                disabled={disabled}
              />
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 pt-2 border-t">
          <Label htmlFor="mm-chuva" className="text-sm font-medium">Índice pluviométrico (mm):</Label>
          <Input
            id="mm-chuva"
            type="number"
            step="0.1"
            min="0"
            value={value.mmChuva ?? ""}
            onChange={e => onChange({ ...value, mmChuva: e.target.value === "" ? null : Number(e.target.value) })}
            className="w-32 h-9"
            disabled={disabled}
          />
        </div>
      </CardContent>
    </Card>
  );
}
