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

// Ícone da sede (estrela azul)
const sedeIcon = L.divIcon({
  html: `<div style="background:#3b82f6;border:2px solid white;border-radius:50%;width:16px;height:16px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3)">
    <span style="color:white;font-size:9px;font-weight:bold;line-height:1">S</span>
</div>`,
  className: "",
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

// Ícone de obra por health
const obraIcon = (health: string) => {
  const color = health === "green" ? "#22c55e" : health === "yellow" ? "#f59e0b" : "#ef4444";
  return L.divIcon({
    html: `<div style="background:${color};border:2px solid white;border-radius:50%;width:12px;height:12px;box-shadow:0 2px 4px rgba(0,0,0,0.3)"></div>`,
    className: "",
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
};

// Distância em km em linha reta (Haversine)
function distanciaKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

      const dist = distanciaKm(SEDE.lat, SEDE.lng, obra.lat, obra.lng);

      marker.bindPopup(`
        <div style="min-width:180px">
          <b style="font-size:13px">${obra.nome}</b><br/>
          <span>📍 ${obra.municipio}</span><br/>
          <span>${BRL.format(obra.valor_contrato)}</span><br/>
          <span>${statusLabel[obra.status] || obra.status}</span><br/>
          <span>📏 ~${dist.toFixed(0)} km da sede (linha reta)</span><br/>
          <a href="#" onclick="window.__holdingObraClick && window.__holdingObraClick('${obra.id}'); return false;" style="color:#3b82f6;text-decoration:underline;font-size:12px">
            Abrir obra →
          </a>
        </div>
      `);

      marker.on("mouseover", () => marker.openPopup());
    });

    (window as any).__holdingObraClick = onObraClick;
  }, [obras, onObraClick]);

  return (
    <div className="relative w-full">
      <div ref={containerRef} style={{ height: 420, width: "100%" }} className="rounded-lg z-0" />
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-2">
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full inline-block" style={{ background: "#3b82f6" }} /> S = Sede Gravataí</span>
        <span>|</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full inline-block" style={{ background: "#22c55e" }} /> Sob controle</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full inline-block" style={{ background: "#f59e0b" }} /> Atenção</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full inline-block" style={{ background: "#ef4444" }} /> Crítico</span>
      </div>
    </div>
  );
}
