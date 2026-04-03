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
