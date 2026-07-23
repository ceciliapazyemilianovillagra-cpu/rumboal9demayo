"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export type MapPoint = {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  detail: string;
  kind: "sede" | "reclamo" | "referente";
};

export function TerritoryMap({ points }: { points: MapPoint[] }) {
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!elementRef.current) return;
    let disposed = false;
    let destroy = () => {};
    void import("leaflet").then((L) => {
      if (disposed || !elementRef.current) return;
      const center: [number, number] = points.length
        ? [points[0].latitude, points[0].longitude]
        : [-26.8083, -65.2176];
      const map = L.map(elementRef.current, { zoomControl: true }).setView(center, points.length ? 13 : 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);
      const colors = { sede: "#2d2d49", reclamo: "#d66253", referente: "#2d8f70" };
      const bounds: [number, number][] = [];
      points.forEach((point) => {
        bounds.push([point.latitude, point.longitude]);
        L.circleMarker([point.latitude, point.longitude], {
          radius: 9, color: "#fff", weight: 3, fillColor: colors[point.kind], fillOpacity: 1,
        }).addTo(map).bindPopup(`<strong>${escapeHtml(point.title)}</strong><br>${escapeHtml(point.detail)}`);
      });
      if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
      destroy = () => map.remove();
    });
    return () => { disposed = true; destroy(); };
  }, [points]);

  return <div className="leaflet-map" ref={elementRef} aria-label="Mapa territorial de sedes, reclamos y referentes" />;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char] ?? char));
}
