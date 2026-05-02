import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Home, Save, X, MousePointerClick, Trash2 } from "lucide-react";

interface MeshPickItem {
  name: string;
  groupName?: string;
  childMeshes: string[];
}

interface AssignHousePopoverProps {
  picked: MeshPickItem | null;
  totalHouses: number;
  /** Casa atualmente atribuída à malha clicada, se houver. */
  currentHouse: number | null;
  saving: boolean;
  /** Defaults: includeChildren=true */
  onConfirm: (houseNumber: number, includeChildren: boolean) => void;
  onClear: () => void;
  onClose: () => void;
}

/**
 * Card flutuante exibido ao clicar numa malha no modo "Atribuir Casas".
 * Mostra nome do grupo pai (se existir), seletor de casa e toggle
 * "também aplicar aos filhos do grupo pai".
 */
export function AssignHousePopover({
  picked, totalHouses, currentHouse,
  saving, onConfirm, onClear, onClose,
}: AssignHousePopoverProps) {
  const [house, setHouse] = useState<string>(currentHouse ? String(currentHouse) : "1");
  const [includeChildren, setIncludeChildren] = useState(true);

  const houseOptions = useMemo(
    () => Array.from({ length: totalHouses }, (_, i) => i + 1),
    [totalHouses]
  );

  if (!picked) return null;
  const childCount = picked.childMeshes.length;

  return (
    <Card className="absolute bottom-4 right-4 w-[340px] z-30 bg-background/98 backdrop-blur-md border-primary/40 shadow-xl">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <MousePointerClick className="h-4 w-4 text-primary" />
            Atribuir casa
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pb-3">
        <div className="text-xs space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-muted-foreground">Malha:</span>
            <Badge variant="outline" className="font-mono text-[10px] truncate max-w-[200px]">
              {picked.name}
            </Badge>
          </div>
          {picked.groupName && (
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Grupo:</span>
              <Badge variant="secondary" className="font-mono text-[10px]">
                {picked.groupName}
              </Badge>
            </div>
          )}
          {currentHouse && (
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Atualmente:</span>
              <Badge className="text-[10px]">
                <Home className="h-2.5 w-2.5 mr-0.5" />
                Casa {String(currentHouse).padStart(2, "0")}
              </Badge>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">
            Esta malha é da casa
          </Label>
          <Select value={house} onValueChange={setHouse} disabled={saving}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              {houseOptions.map(n => (
                <SelectItem key={n} value={String(n)}>
                  <span className="flex items-center gap-1.5">
                    <Home className="h-3 w-3" />
                    Casa {String(n).padStart(2, "0")}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {childCount > 0 && (
          <div className="flex items-start justify-between gap-2 p-2 rounded-md bg-muted/40 border border-border/50">
            <div className="flex-1">
              <Label htmlFor="incl-children" className="text-xs cursor-pointer">
                Aplicar a {childCount} mesh(es) filho(s)
              </Label>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Telhado, paredes, piso etc. do mesmo grupo serão atribuídos à mesma casa.
              </p>
            </div>
            <Switch
              id="incl-children"
              checked={includeChildren}
              onCheckedChange={setIncludeChildren}
              disabled={saving}
            />
          </div>
        )}

        <div className="flex gap-2 pt-1">
          {currentHouse && (
            <Button
              variant="outline" size="sm"
              onClick={onClear}
              disabled={saving}
              className="flex-1 text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Limpar
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => onConfirm(parseInt(house, 10), includeChildren)}
            disabled={saving}
            className="flex-1"
          >
            {saving
              ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              : <Save className="h-3.5 w-3.5 mr-1" />}
            Confirmar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
