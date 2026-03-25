import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix ícone padrão do Leaflet com Vite
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, shadowUrl: iconShadow });

// Coordenadas reais (lat/lng) de Gravataí — sede da empresa
const SEDE = { lat: -29.9441, lng: -50.9914, label: "Sede — Gravataí" };

// Ícone da sede
const sedeIcon = L.divIcon({
  html: `<div style="
    background:#1d4ed8;
    border:3px solid white;
    border-radius:50%;
    width:26px;height:26px;
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 3px 8px rgba(0,0,0,0.4);
    font-size:11px;font-weight:bold;color:white;line-height:1;
  ">S</div>`,
  className: "",
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

// Ícone de obra por health
const obraIcon = (health: string) => {
  const color = health === "green" ? "#22c55e" : health === "yellow" ? "#f59e0b" : "#ef4444";
  const border = health === "green" ? "#15803d" : health === "yellow" ? "#b45309" : "#b91c1c";
  return L.divIcon({
    html: `<div style="
      background:${color};
      border:2px solid ${border};
      border-radius:50%;
      width:14px;height:14px;
      box-shadow:0 1px 4px rgba(0,0,0,0.35);
      transition:transform 0.1s;
    "></div>`,
    className: "",
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
};

// Distância em linha reta (Haversine) — sem API externa
function distanciaLinhaReta(lat1: number, lng1: number, lat2: number, lng2: number): string {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng/2)**2;
  const km = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const minutos = Math.round((km / 80) * 60);
  const h = Math.floor(minutos / 60);
  const min = minutos % 60;
  const tempo = h > 0 ? `${h}h${min > 0 ? ` ${min}min` : ""}` : `${min}min`;
  return `📏 ${km.toFixed(0)} km · ~${tempo} (linha reta)`;
}

export interface MapObra {
  id: string;
  nome: string;
  municipio: string;
  lat: number;
  lng: number;
  health: string;
  valor_contrato: number;
  status: string;
}

interface HoldingMapProps {
  obras: MapObra[];
  onObraClick: (id: string) => void;
}

export default function HoldingMap({ obras, onObraClick }: HoldingMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [-29.7, -52.5],
      zoom: 7,
      zoomControl: true,
      scrollWheelZoom: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 18,
    }).addTo(map);

    const sedeMarker = L.marker([SEDE.lat, SEDE.lng], { icon: sedeIcon, zIndexOffset: 1000 }).addTo(map);
    sedeMarker.bindPopup(`<b>🏢 ${SEDE.label}</b><br/>Sede da empresa`);

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Atualizar markers quando obras mudam
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.eachLayer(layer => {
      if (layer instanceof L.Marker && (layer as any)._isObra) {
        map.removeLayer(layer);
      }
    });

    const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
    const statusLabel: Record<string, string> = {
      em_andamento: "Em Andamento", nao_iniciada: "Não Iniciada",
      concluida: "Concluída", paralisada: "Paralisada",
    };

    obras.forEach(obra => {
      const marker = L.marker([obra.lat, obra.lng], { icon: obraIcon(obra.health) }).addTo(map);
      (marker as any)._isObra = true;

      const distStr = distanciaLinhaReta(SEDE.lat, SEDE.lng, obra.lat, obra.lng);

      marker.bindTooltip(`
        <div style="min-width:200px;font-family:sans-serif;line-height:1.7">
          <b style="font-size:13px">${obra.nome}</b><br/>
          <span style="color:#666;font-size:11px">📍 ${obra.municipio}</span><br/>
          <span style="font-size:12px;font-weight:600">${BRL.format(obra.valor_contrato)}</span><br/>
          <span style="font-size:11px">${statusLabel[obra.status] || obra.status}</span><br/>
          <span style="color:#1d4ed8;font-size:11px">${distStr}</span>
        </div>
      `, { sticky: true, direction: "top", offset: [0, -8] });

      marker.on("click", () => onObraClick(obra.id));
    });

    
  }, [obras, onObraClick]);

  return (
    <div className="relative w-full">
      <div ref={containerRef} style={{ height: 420, width: "100%" }} className="rounded-lg z-0" />
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-2 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="h-4 w-4 rounded-full inline-block border-2 border-blue-700" style={{ background: "#1d4ed8" }} />
          Sede — Gravataí
        </span>
        <span>·</span>
        <span className="flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-full inline-block border border-green-700" style={{ background: "#22c55e" }} /> Sob controle</span>
        <span className="flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-full inline-block border border-amber-700" style={{ background: "#f59e0b" }} /> Atenção</span>
        <span className="flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-full inline-block border border-red-700" style={{ background: "#ef4444" }} /> Crítico</span>
        <span className="ml-auto opacity-60">Distâncias estimadas em linha reta a partir da sede</span>
      </div>
    </div>
  );
}
