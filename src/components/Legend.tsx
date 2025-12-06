export function Legend() {
  const items = [
    { color: "bg-status-not-started", label: "Não Iniciado" },
    { color: "bg-status-foundation", label: "Fundação" },
    { color: "bg-status-structure", label: "Estrutura" },
    { color: "bg-status-finishing", label: "Acabamento" },
    { color: "bg-status-completed", label: "Concluído" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-4 p-4 bg-card rounded-xl border border-border">
      <span className="text-sm font-medium text-foreground">Legenda</span>
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <div className={`w-4 h-4 rounded-full ${item.color}`} />
          <span className="text-sm text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
