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
      border:2.5px solid ${border};
      border-radius:50%;
      width:20px;height:20px;
      box-shadow:0 2px 6px rgba(0,0,0,0.4);
      transition:transform 0.1s;
    "></div>`,
    className: "",
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
};

// Distância real de carro via OSRM (API gratuita, sem API key)
async function distanciaRota(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): Promise<{ km: number; horas: string } | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=false`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.[0]) return null;
    const km = data.routes[0].distance / 1000;
    const totalMin = Math.round(data.routes[0].duration / 60);
    const h = Math.floor(totalMin / 60);
    const min = totalMin % 60;
    const horas = h > 0
      ? `${h}h${min > 0 ? ` ${min}min` : ""}`
      : `${min}min`;
    return { km, horas };
  } catch {
    return null;
  }
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

      const distId = `dist-${obra.id}`;

      marker.bindPopup(`
        <div style="min-width:190px;font-family:sans-serif;line-height:1.6">
          <b style="font-size:13px">${obra.nome}</b><br/>
          <span style="color:#666;font-size:11px">📍 ${obra.municipio}</span><br/>
          <span style="font-size:11px">${BRL.format(obra.valor_contrato)}</span><br/>
          <span style="font-size:11px">${statusLabel[obra.status] || obra.status}</span><br/>
          <span id="${distId}" style="color:#1d4ed8;font-size:11px">🚗 Calculando rota...</span><br/>
          <a href="#"
            onclick="window.__holdingObraClick && window.__holdingObraClick('${obra.id}'); return false;"
            style="color:#3b82f6;text-decoration:underline;font-size:12px">
            Abrir obra →
          </a>
        </div>
      `);

      marker.on("popupopen", async () => {
        const el = document.getElementById(distId);
        if (!el) return;
        const rota = await distanciaRota(SEDE.lat, SEDE.lng, obra.lat, obra.lng);
        const elAtual = document.getElementById(distId);
        if (!elAtual) return;
        elAtual.innerHTML = rota
          ? `🚗 ${rota.km.toFixed(0)} km de carro · ~${rota.horas}`
          : `📏 Distância indisponível`;
      });

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
