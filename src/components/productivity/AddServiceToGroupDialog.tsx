import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import type { ServiceRef } from './TeamWorkGroupDialog';

interface Props {
  open: boolean;
  onClose: () => void;
  available: ServiceRef[];
  alreadyLinkedScopeIds: string[];
  onConfirm: (selected: ServiceRef[]) => Promise<void> | void;
}

export function AddServiceToGroupDialog({ open, onClose, available, alreadyLinkedScopeIds, onConfirm }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return available
      .filter((s) => !alreadyLinkedScopeIds.includes(s.scopeId))
      .filter((s) => !q || s.scopeName.toLowerCase().includes(q) || s.macroName.toLowerCase().includes(q));
  }, [available, alreadyLinkedScopeIds, query]);

  const handleConfirm = async () => {
    const list = filtered.filter((s) => selected[s.scopeId]);
    if (!list.length) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await onConfirm(list);
      setSelected({});
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Vincular servicos a frente</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Buscar servico..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mb-3"
        />
        <ScrollArea className="h-72 rounded-md border">
          <div className="divide-y">
            {filtered.map((s) => (
              <label
                key={s.scopeId}
                className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-accent/40"
              >
                <Checkbox
                  checked={!!selected[s.scopeId]}
                  onCheckedChange={(v) => setSelected((p) => ({ ...p, [s.scopeId]: !!v }))}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{s.scopeName}</p>
                  <p className="truncate text-xs text-muted-foreground">{s.macroName}</p>
                </div>
              </label>
            ))}
            {filtered.length === 0 && (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Nenhum servico disponivel.
              </div>
            )}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={saving}>
            {saving ? 'Vinculando...' : 'Vincular selecionados'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
