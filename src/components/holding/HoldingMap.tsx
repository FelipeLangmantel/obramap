import { useEffect, useRef, useImperativeHandle, forwardRef, useState, useCallback } from "react";
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
  const color = health === "green" ? "#22c55e" : health === "yellow" ? "#f59e0b" : health === "red" ? "#ef4444" : "#94a3b8";
  const border = health === "green" ? "#15803d" : health === "yellow" ? "#b45309" : health === "red" ? "#b91c1c" : "#64748b";
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

// Cluster icon
const clusterIcon = (count: number, dominantHealth: string) => {
  const color = dominantHealth === "green" ? "#22c55e" : dominantHealth === "yellow" ? "#f59e0b" : dominantHealth === "red" ? "#ef4444" : "#3b82f6";
  const border = dominantHealth === "green" ? "#15803d" : dominantHealth === "yellow" ? "#b45309" : dominantHealth === "red" ? "#b91c1c" : "#1d4ed8";
  return L.divIcon({
    html: `<div style="
      background:${color};
      border:3px solid ${border};
      border-radius:50%;
      width:30px;height:30px;
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 2px 6px rgba(0,0,0,0.4);
      font-size:12px;font-weight:bold;color:white;line-height:1;
      cursor:pointer;
    ">${count}</div>`,
    className: "",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
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

// Dominant health in a group
function getDominantHealth(obras: MapObra[]): string {
  const counts: Record<string, number> = {};
  obras.forEach(o => { counts[o.health] = (counts[o.health] || 0) + 1; });
  if (counts["red"]) return "red";
  if (counts["yellow"]) return "yellow";
  if (counts["green"]) return "green";
  return "gray";
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

export interface HoldingMapHandle {
  flyTo: (lat: number, lng: number, zoom?: number) => void;
}

interface HoldingMapProps {
  obras: MapObra[];
  onObraClick: (id: string) => void;
}

const HoldingMap = forwardRef<HoldingMapHandle, HoldingMapProps>(({ obras, onObraClick }, ref) => {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [mapInteractionEnabled, setMapInteractionEnabled] = useState(false);

  const disableMapInteraction = useCallback(() => {
    setMapInteractionEnabled(false);
  }, []);

  const enableMapInteraction = useCallback(() => {
    setMapInteractionEnabled(true);
  }, []);

  useImperativeHandle(ref, () => ({
    flyTo: (lat: number, lng: number, zoom = 11) => {
      mapRef.current?.flyTo([lat, lng], zoom, { duration: 1.2 });
    },
  }));

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [-29.7, -52.5],
      zoom: 7,
      zoomControl: false,
      scrollWheelZoom: false,
      dragging: false,
      doubleClickZoom: false,
      touchZoom: false,
      boxZoom: false,
      keyboard: false,
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handlers = [
      map.scrollWheelZoom,
      map.dragging,
      map.doubleClickZoom,
      map.touchZoom,
      map.boxZoom,
      map.keyboard,
      (map as any).tap,
    ].filter(Boolean);

    handlers.forEach((handler: any) => {
      if (mapInteractionEnabled) handler.enable();
      else handler.disable();
    });

    const hasZoomControl = Boolean((map.zoomControl as any)?._map);
    if (mapInteractionEnabled && !hasZoomControl) {
      map.zoomControl.addTo(map);
    } else if (!mapInteractionEnabled && hasZoomControl) {
      map.zoomControl.remove();
    }
  }, [mapInteractionEnabled]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        disableMapInteraction();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [disableMapInteraction]);

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

    // Group obras by coordinates (rounded to 3 decimals for clustering)
    const coordKey = (lat: number, lng: number) => `${lat.toFixed(3)}_${lng.toFixed(3)}`;
    const groups = new Map<string, MapObra[]>();
    obras.forEach(obra => {
      const key = coordKey(obra.lat, obra.lng);
      const list = groups.get(key) || [];
      list.push(obra);
      groups.set(key, list);
    });

    groups.forEach((groupObras) => {
      if (groupObras.length === 1) {
        // Single obra — normal marker
        const obra = groupObras[0];
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
      } else {
        // Multiple obras — cluster marker
        const avgLat = groupObras.reduce((s, o) => s + o.lat, 0) / groupObras.length;
        const avgLng = groupObras.reduce((s, o) => s + o.lng, 0) / groupObras.length;
        const dominant = getDominantHealth(groupObras);
        const marker = L.marker([avgLat, avgLng], { icon: clusterIcon(groupObras.length, dominant) }).addTo(map);
        (marker as any)._isObra = true;

        const municipio = groupObras[0].municipio;
        const popupHtml = `
          <div style="min-width:180px;font-family:sans-serif;">
            <b style="font-size:13px">📍 ${municipio}</b>
            <p style="font-size:11px;color:#666;margin:2px 0 6px">${groupObras.length} obras</p>
            ${groupObras.map(o => {
              const hc = o.health === "green" ? "#22c55e" : o.health === "yellow" ? "#f59e0b" : o.health === "red" ? "#ef4444" : "#94a3b8";
              return `<div class="cluster-obra-item" data-obra-id="${o.id}" style="
                display:flex;align-items:center;gap:6px;padding:4px 6px;margin:2px 0;border-radius:4px;cursor:pointer;
                border:1px solid #e5e7eb;transition:background 0.15s;
              " onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='transparent'">
                <span style="width:8px;height:8px;border-radius:50%;background:${hc};flex-shrink:0;"></span>
                <span style="font-size:11px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${o.nome}</span>
                <span style="font-size:10px;color:#888;">${BRL.format(o.valor_contrato)}</span>
              </div>`;
            }).join("")}
          </div>
        `;

        const popup = L.popup({ maxWidth: 300, closeButton: true }).setContent(popupHtml);
        marker.bindPopup(popup);

        marker.on("popupopen", () => {
          const container = popup.getElement();
          if (!container) return;
          const items = container.querySelectorAll(".cluster-obra-item");
          items.forEach((el) => {
            el.addEventListener("click", () => {
              const obraId = el.getAttribute("data-obra-id");
              if (obraId) {
                map.closePopup();
                onObraClick(obraId);
              }
            });
          });
        });
      }
    });
  }, [obras, onObraClick]);

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <div className="relative" onClick={enableMapInteraction} onMouseLeave={disableMapInteraction}>
        <div ref={containerRef} style={{ height: 420, width: "100%" }} className="rounded-lg z-0" />
        <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded-md bg-background/90 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground shadow-sm ring-1 ring-border/70 backdrop-blur">
          {mapInteractionEnabled
            ? "Mapa ativo — clique fora para liberar o scroll da página"
            : "Clique para interagir com o mapa"}
        </div>
      </div>
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
});

HoldingMap.displayName = "HoldingMap";
export default HoldingMap;
