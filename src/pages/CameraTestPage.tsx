/**
 * Diagnóstico de câmera — rota pública sem AuthContext, sem ConstructionContext.
 * Acesse em: /camera-test
 * Objetivo: provar se o crash é do app ou do WebView/Android.
 */
import { useEffect, useRef, useState } from "react";

interface LogEntry { ts: string; msg: string; type: "ok"|"err"|"warn"|"info"; }

export function CameraTestPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [deviceInfo, setDeviceInfo] = useState("");
  const [imgSrc, setImgSrc] = useState<string|null>(null);
  const t0 = useRef(Date.now());

  function ts() { return ((Date.now() - t0.current) / 1000).toFixed(2) + "s"; }
  function log(msg: string, type: LogEntry["type"] = "info") {
    setLogs(p => [...p, { ts: ts(), msg, type }]);
  }

  useEffect(() => {
    let info = "";
    info += `UA: ${navigator.userAgent.substring(0, 120)}\n`;
    info += `deviceMemory: ${(navigator as any).deviceMemory ?? "N/A"} GB\n`;
    info += `cores: ${navigator.hardwareConcurrency ?? "N/A"}\n`;
    info += `online: ${navigator.onLine}\n`;
    if ((performance as any).memory) {
      const m = (performance as any).memory;
      info += `Heap: ${(m.usedJSHeapSize/1048576).toFixed(1)} MB / ${(m.jsHeapSizeLimit/1048576).toFixed(1)} MB\n`;
    } else {
      info += "performance.memory: N/A (normal em iOS/Firefox)\n";
    }
    // Detectar process death
    const key = "obramap_cam_diag_ts";
    const prev = sessionStorage.getItem(key);
    const now = String(Date.now());
    sessionStorage.setItem(key, now);
    if (prev && Number(now) - Number(prev) < 15000) {
      info += "⚠️ PROCESS DEATH: sessão reiniciou <15s atrás!\n";
    } else {
      info += "Process death: não detectado\n";
    }
    setDeviceInfo(info);
    log("Página carregada — zero ConstructionContext, zero dados de obra", "ok");
  }, []);

  function handleMinimal(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) { log("T1: cancelado ou sem arquivo", "warn"); return; }
    const mb = (file.size / 1048576).toFixed(2);
    log(`✅ T1 PASSOU — ${file.name} | ${mb} MB | ${file.type}`, "ok");
    if ((performance as any).memory) {
      const u = ((performance as any).memory.usedJSHeapSize / 1048576).toFixed(1);
      log(`Heap após T1: ${u} MB`, "info");
    }
    e.target.value = "";
  }

  async function handleCanvas(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) { log("T2: cancelado", "warn"); return; }
    const mb = (file.size / 1048576).toFixed(2);
    log(`T2: arquivo ${mb} MB — iniciando canvas...`, "warn");
    try {
      const bmp = await createImageBitmap(file, { resizeWidth: 1280, resizeQuality: "medium" } as any);
      log(`T2: bitmap ${bmp.width}x${bmp.height} criado`, "info");
      const canvas = document.createElement("canvas");
      canvas.width = bmp.width; canvas.height = bmp.height;
      canvas.getContext("2d")!.drawImage(bmp, 0, 0);
      bmp.close();
      canvas.toBlob(blob => {
        if (!blob) { log("T2: toBlob retornou null", "err"); return; }
        const kb = (blob.size / 1024).toFixed(0);
        log(`✅ T2 PASSOU — canvas OK: ${kb} KB`, "ok");
        setImgSrc(URL.createObjectURL(blob));
        canvas.width = 1; canvas.height = 1;
        if ((performance as any).memory) {
          const u = ((performance as any).memory.usedJSHeapSize / 1048576).toFixed(1);
          log(`Heap após T2: ${u} MB`, "info");
        }
      }, "image/jpeg", 0.72);
    } catch (err: any) {
      log(`❌ T2 FALHOU: ${err.message}`, "err");
    }
    e.target.value = "";
  }

  function handleGallery(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) { log("T3: cancelado", "warn"); return; }
    const mb = (file.size / 1048576).toFixed(2);
    log(`✅ T3 PASSOU — galeria: ${file.name} | ${mb} MB`, "ok");
    e.target.value = "";
  }

  const colors: Record<LogEntry["type"], string> = {
    ok: "#4ade80", err: "#f87171", warn: "#fbbf24", info: "#94a3b8"
  };

  return (
    <div style={{ fontFamily: "monospace", padding: 16, background: "#111", color: "#eee", minHeight: "100vh", fontSize: 13 }}>
      <h2 style={{ color: "#60a5fa", marginBottom: 8 }}>📷 Diagnóstico de Câmera</h2>
      <p style={{ color: "#94a3b8", fontSize: 11, marginBottom: 16 }}>
        Rota pública — zero contextos de obra carregados.<br/>
        Testa 3 cenários para isolar a causa do crash.
      </p>

      {/* TESTE 1 */}
      <div style={{ border: "1px solid #374151", borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <div style={{ color: "#93c5fd", fontWeight: "bold", marginBottom: 6 }}>TESTE 1 — Mínimo (sem processar)</div>
        <p style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>Só abre câmera e loga tamanho. Sem canvas, sem compressão.</p>
        <label style={{ display: "block", padding: "12px 0", background: "#2563eb", color: "white", textAlign: "center", borderRadius: 8, cursor: "pointer", fontWeight: "bold" }}>
          📷 TIRAR FOTO (mínimo)
          <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handleMinimal} />
        </label>
      </div>

      {/* TESTE 2 */}
      <div style={{ border: "1px solid #374151", borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <div style={{ color: "#93c5fd", fontWeight: "bold", marginBottom: 6 }}>TESTE 2 — Com canvas/compressão</div>
        <p style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>Abre câmera E comprime. Se só este crashar → é a compressão.</p>
        <label style={{ display: "block", padding: "12px 0", background: "#7c3aed", color: "white", textAlign: "center", borderRadius: 8, cursor: "pointer", fontWeight: "bold" }}>
          📷 TIRAR FOTO (com canvas)
          <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handleCanvas} />
        </label>
        {imgSrc && <img src={imgSrc} alt="preview" style={{ maxWidth: "100%", marginTop: 8, borderRadius: 6 }} />}
      </div>

      {/* TESTE 3 */}
      <div style={{ border: "1px solid #374151", borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <div style={{ color: "#93c5fd", fontWeight: "bold", marginBottom: 6 }}>TESTE 3 — Galeria (sem câmera)</div>
        <p style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>Se funcionar e câmera não funcionar → problema é o capture="environment".</p>
        <label style={{ display: "block", padding: "12px 0", background: "#dc2626", color: "white", textAlign: "center", borderRadius: 8, cursor: "pointer", fontWeight: "bold" }}>
          🖼️ SELECIONAR DA GALERIA
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleGallery} />
        </label>
      </div>

      {/* DEVICE INFO */}
      <div style={{ border: "1px solid #374151", borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <div style={{ color: "#93c5fd", fontWeight: "bold", marginBottom: 6 }}>Dispositivo</div>
        <pre style={{ fontSize: 10, color: "#94a3b8", whiteSpace: "pre-wrap", margin: 0 }}>{deviceInfo}</pre>
      </div>

      {/* LOG */}
      <div style={{ border: "1px solid #374151", borderRadius: 8, padding: 12 }}>
        <div style={{ color: "#93c5fd", fontWeight: "bold", marginBottom: 6 }}>
          Log de eventos
          <button onClick={() => setLogs([])} style={{ marginLeft: 12, padding: "2px 8px", background: "#374151", color: "#eee", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 11 }}>
            Limpar
          </button>
        </div>
        <div style={{ background: "#1a1a1a", padding: 8, borderRadius: 4, maxHeight: 250, overflowY: "auto", fontSize: 11 }}>
          {logs.length === 0 && <span style={{ color: "#94a3b8" }}>Nenhum evento ainda.</span>}
          {logs.map((l, i) => (
            <div key={i} style={{ color: colors[l.type] }}>
              [{l.ts}] {l.msg}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
