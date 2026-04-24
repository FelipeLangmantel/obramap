import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  count: number;
  onAdd?: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
  id?: string;
  emptyText?: string;
}

export function RdoSectionShell({ title, count, onAdd, disabled, children, id, emptyText }: Props) {
  return (
    <section id={id} className="rounded-lg border bg-card scroll-mt-4">
      <header className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className={cn(
          "text-sm font-semibold uppercase tracking-wide",
          "text-orange-600 dark:text-orange-400"
        )}>
          {title} ({count})
        </h3>
        {onAdd && (
          <Button
            size="sm"
            onClick={onAdd}
            disabled={disabled}
            className="h-8 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Adicionar
          </Button>
        )}
      </header>
      <div className="p-4">
        {count === 0 && emptyText ? (
          <p className="text-sm text-muted-foreground text-center py-2">{emptyText}</p>
        ) : children}
      </div>
    </section>
  );
}
