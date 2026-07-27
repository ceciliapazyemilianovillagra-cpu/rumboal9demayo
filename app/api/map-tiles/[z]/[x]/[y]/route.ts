import type { NextRequest } from "next/server";

const MAX_ZOOM = 19;
const CARTO_SUBDOMAINS = ["a", "b", "c", "d"] as const;
const CACHE_CONTROL = "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800";

type RouteContext = {
  params: Promise<{ z: string; x: string; y: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const raw = await context.params;
  const coordinates = parseCoordinates(raw);

  if (!coordinates) {
    return new Response("Coordenadas de mapa inválidas.", {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const { z, x, y } = coordinates;
  const subdomain = CARTO_SUBDOMAINS[(x + y) % CARTO_SUBDOMAINS.length];
  const cartoUrl = `https://${subdomain}.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`;
  const osmUrl = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

  try {
    const tile = await fetchTile(cartoUrl) ?? await fetchTile(osmUrl);

    if (!tile) {
      return new Response("El mapa base no está disponible temporalmente.", {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      });
    }

    return new Response(tile.body, {
      status: 200,
      headers: {
        "Cache-Control": CACHE_CONTROL,
        "Content-Type": tile.contentType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("El mapa base no está disponible temporalmente.", {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

function parseCoordinates(raw: { z: string; x: string; y: string }) {
  if (![raw.z, raw.x, raw.y].every((value) => /^\d+$/.test(value))) return null;

  const z = Number(raw.z);
  const x = Number(raw.x);
  const y = Number(raw.y);
  if (!Number.isSafeInteger(z) || !Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return null;
  if (z < 0 || z > MAX_ZOOM) return null;

  const limit = 2 ** z;
  if (x < 0 || y < 0 || x >= limit || y >= limit) return null;
  return { z, x, y };
}

async function fetchTile(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "image/avif,image/webp,image/png,image/*,*/*;q=0.8",
      Referer: "https://rumboal9demayo.vercel.app/",
      "User-Agent": "RumboAl9DeMayo/1.0",
    },
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !contentType.toLowerCase().startsWith("image/")) return null;

  return {
    body: await response.arrayBuffer(),
    contentType,
  };
}
