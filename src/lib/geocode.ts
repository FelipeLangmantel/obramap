export async function geocodeMunicipio(municipio: string, estado: string = "RS"): Promise<{ lat: number; lng: number } | null> {
  if (!municipio?.trim()) return null;

  try {
    const query = encodeURIComponent(`${municipio}, ${estado}, Brasil`);
    const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=br`;

    const res = await fetch(url, {
      headers: { "User-Agent": "ObraMap/1.0 (obramap.app.br)" }
    });

    const data = await res.json();

    if (data?.[0]?.lat && data?.[0]?.lon) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }

    return null;
  } catch {
    return null;
  }
}

const toLocalDateKey = (date = new Date()) => {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
};

export async function fetchClimaHoje(lat: number, lng: number, dateKey?: string): Promise<{
  codigo: "sol" | "nublado" | "chuva_fraca" | "chuva_forte" | "vento";
  mm_chuva: number;
  temperatura: number;
} | null> {
  try {
    const targetDate = dateKey || toLocalDateKey();
    const today = toLocalDateKey();
    const baseUrl = targetDate < today
      ? "https://archive-api.open-meteo.com/v1/archive"
      : "https://api.open-meteo.com/v1/forecast";
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lng),
      daily: "precipitation_sum,temperature_2m_max,windspeed_10m_max",
      timezone: "America/Sao_Paulo",
      start_date: targetDate,
      end_date: targetDate,
    });
    const url = `${baseUrl}?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const chuva = data?.daily?.precipitation_sum?.[0] ?? 0;
    const temp  = data?.daily?.temperature_2m_max?.[0] ?? 20;
    const vento = data?.daily?.windspeed_10m_max?.[0] ?? 0;
    let codigo: "sol" | "nublado" | "chuva_fraca" | "chuva_forte" | "vento" = "sol";
    if (chuva > 15) codigo = "chuva_forte";
    else if (chuva > 2) codigo = "chuva_fraca";
    else if (vento > 50) codigo = "vento";
    else if (temp < 18) codigo = "nublado";
    return { codigo, mm_chuva: Number(chuva), temperatura: Number(temp) };
  } catch {
    return null;
  }
}
