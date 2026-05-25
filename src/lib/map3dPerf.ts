type Map3DPerfMark = {
  label: string;
  start: number;
};

const MAP3D_PERF_FLAG = "obramap:map3d:perf";

export function isMap3DPerfEnabled() {
  return typeof window !== "undefined" && window.localStorage.getItem(MAP3D_PERF_FLAG) === "1";
}

export function startMap3DPerf(label: string, detail?: Record<string, unknown>): Map3DPerfMark | null {
  if (!isMap3DPerfEnabled()) return null;
  const mark = { label, start: performance.now() };
  console.info(`[Map3D Perf] ${label}:start`, detail ?? {});
  return mark;
}

export function endMap3DPerf(mark: Map3DPerfMark | null, detail?: Record<string, unknown>) {
  if (!mark || !isMap3DPerfEnabled()) return;
  console.info(`[Map3D Perf] ${mark.label}:end`, {
    durationMs: Math.round(performance.now() - mark.start),
    ...(detail ?? {}),
  });
}
