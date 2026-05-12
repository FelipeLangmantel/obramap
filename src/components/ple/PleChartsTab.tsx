import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from "recharts";
import type { usePleData } from "@/hooks/usePleData";

type PleDataReturn = ReturnType<typeof usePleData>;

const COLORS = ["#f97316", "#3b82f6", "#22c55e", "#a855f7", "#ec4899", "#06b6d4", "#eab308", "#ef4444"];

export function PleChartsTab({ groups, events, measurements, entries, currentProject }: PleDataReturn) {
  const contractValue = currentProject?.contract_value || 0;
  const totalHouses = Math.max(1, Number(currentProject?.total_houses) || 1);
  const eventContractValue = (event: typeof events[number]) => {
    const factor = (event.billing_type || "per_house") === "per_house" ? totalHouses : 1;
    return (event.quantity || 0) * (event.unit_value || 0) * factor;
  };
  const eventMeasuredValue = (event: typeof events[number], measuredQty: number) =>
    measuredQty * ((event.quantity || 0) * (event.unit_value || 0));

  // Line chart: progress per measurement
  const lineData = useMemo(() => {
    return measurements.map(m => {
      const measuredEntries = entries.filter(e => e.measurement_id === m.id);
      let valorMedido = 0;
      measuredEntries.forEach(entry => {
        const event = events.find(ev => ev.id === entry.event_id);
        if (event) valorMedido += eventMeasuredValue(event, 1);
      });

      // Accumulated up to this measurement
      const measurementsUpTo = measurements.filter(m2 => m2.measurement_number <= m.measurement_number);
      const measurementIds = new Set(measurementsUpTo.map(m2 => m2.id));
      let acumEntries = entries.filter(e => measurementIds.has(e.measurement_id));
      let valorAcum = 0;
      acumEntries.forEach(entry => {
        const event = events.find(ev => ev.id === entry.event_id);
        if (event) valorAcum += eventMeasuredValue(event, 1);
      });

      const pctRealizado = contractValue > 0 ? (valorAcum / contractValue) * 100 : 0;

      return {
        name: `Med ${m.measurement_number}`,
        valorMedido: valorMedido / 1000,
        realizado: pctRealizado,
      };
    });
  }, [measurements, entries, events, contractValue]);

  const groupEventsMap = useMemo(() => {
    const map = new Map<string, typeof events>();
    groups.forEach(group => {
      const childIds = new Set(groups.filter(child => child.parent_id === group.id).map(child => child.id));
      map.set(group.id, events.filter(event => event.group_id === group.id || (event.group_id ? childIds.has(event.group_id) : false)));
    });
    return map;
  }, [groups, events]);
  const chartGroups = useMemo(() => {
    const stages = groups.filter(group => !group.parent_id);
    return stages.length > 0 ? stages : groups;
  }, [groups]);

  // Pie chart: distribution by group
  const pieData = useMemo(() => {
    return chartGroups.map(g => {
      const groupEvents = groupEventsMap.get(g.id) || [];
      const totalValue = groupEvents.reduce((sum, ev) => sum + eventContractValue(ev), 0);
      return { name: g.name, value: totalValue };
    }).filter(d => d.value > 0);
  }, [chartGroups, groupEventsMap]);

  // Bar chart: top services by measured value
  const barData = useMemo(() => {
    return events.map(ev => {
      const measuredQty = entries.filter(e => e.event_id === ev.id).length;
      return {
        name: ev.description.substring(0, 20),
        contratado: eventContractValue(ev),
        medido: eventMeasuredValue(ev, measuredQty),
      };
    })
    .sort((a, b) => b.contratado - a.contratado)
    .slice(0, 8);
  }, [events, entries]);

  // Bar chart: execution % by group
  const execData = useMemo(() => {
    return chartGroups.map(g => {
      const groupEvents = groupEventsMap.get(g.id) || [];
      let totalValue = 0, measuredValue = 0;
      groupEvents.forEach(ev => {
        const measuredQty = entries.filter(e => e.event_id === ev.id).length;
        totalValue += eventContractValue(ev);
        measuredValue += eventMeasuredValue(ev, measuredQty);
      });
      return {
        name: g.code,
        executado: totalValue > 0 ? (measuredValue / totalValue) * 100 : 0,
      };
    });
  }, [chartGroups, groupEventsMap, entries]);

  const fmtCur = (v: number) => `R$ ${(v * 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Line Chart */}
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-amber-500" /> Avanço Físico-Financeiro por Medição</CardTitle></CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} unit="%" />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line yAxisId="left" type="monotone" dataKey="realizado" name="Realizado (%)" stroke="#22c55e" strokeWidth={2} dot />
              <Line yAxisId="right" type="monotone" dataKey="valorMedido" name="Valor Medido (R$ mil)" stroke="#3b82f6" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Pie Chart */}
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-500" /> Distribuição por Grupo</CardTitle></CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} label={({ name }) => name?.substring(0, 15)}>
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Bar Chart - Top Services */}
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500" /> Valores Medidos por Serviço (Top 8)</CardTitle></CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 9 }} width={120} />
              <Tooltip formatter={(v: number) => `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="contratado" name="Contratado" fill="#3b82f6" opacity={0.5} />
              <Bar dataKey="medido" name="Medido" fill="#22c55e" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Bar Chart - Execution by Group */}
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-purple-500" /> % Execução por Grupo</CardTitle></CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={execData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
              <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
              <Bar dataKey="executado" name="% Executado" fill="#a855f7" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
