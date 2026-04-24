import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { forwardRef } from "react";

interface Props {
  title: string;
  count: number;
  onAdd?: () => void;
  /** Renderiza o botão de adicionar como label (para acionar input file nativo no mesmo gesto). */
  addAsLabel?: { htmlFor: string };
  disabled?: boolean;
  children?: React.ReactNode;
  id?: string;
  emptyText?: string;
  /** Quando true, sempre renderiza children (mesmo vazio). */
  alwaysShowChildren?: boolean;
}

export function RdoSectionShell({
  title, count, onAdd, addAsLabel, disabled, children, id, emptyText, alwaysShowChildren,
}: Props) {
  const showEmpty = !alwaysShowChildren && count === 0 && emptyText;
  return (
    <section id={id} className="rounded-lg border bg-card scroll-mt-4">
      <header className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className={cn(
          "text-sm font-semibold uppercase tracking-wide",
          "text-orange-600 dark:text-orange-400"
        )}>
          {title} ({count})
        </h3>
        {addAsLabel ? (
          <label htmlFor={addAsLabel.htmlFor}>
            <Button asChild size="sm" disabled={disabled}
              className="h-8 bg-blue-600 hover:bg-blue-700 text-white cursor-pointer">
              <span>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Adicionar
              </span>
            </Button>
          </label>
        ) : onAdd ? (
          <Button size="sm" onClick={onAdd} disabled={disabled}
            className="h-8 bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-3.5 w-3.5 mr-1" />
            Adicionar
          </Button>
        ) : null}
      </header>
      <div className="p-4">
        {showEmpty ? (
          <p className="text-sm text-muted-foreground text-center py-2">{emptyText}</p>
        ) : children}
      </div>
    </section>
  );
}
