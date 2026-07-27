"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const [visibleKinds,setVisibleKinds]=useState<MapPoint["kind"][]>(["sede","reclamo","referente"]);
  const visiblePoints=useMemo(()=>points.filter(point=>visibleKinds.includes(point.kind)),[points,visibleKinds]);

  function toggleKind(kind:MapPoint["kind"]) {
    setVisibleKinds(current=>current.includes(kind)?current.filter(item=>item!==kind):[...current,kind]);
  }

  useEffect(() => {
    if (!elementRef.current) return;
    let disposed = false;
    let destroy = () => {};
    void import("leaflet").then((L) => {
      if (disposed || !elementRef.current) return;
      const center: [number, number] = visiblePoints.length
        ? [visiblePoints[0].latitude, visiblePoints[0].longitude]
        : [-26.8083, -65.2176];
      const map = L.map(elementRef.current, { zoomControl: true }).setView(center, visiblePoints.length ? 13 : 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);
      const colors = { sede: "#2d2d49", reclamo: "#d66253", referente: "#2d8f70" };
      const bounds: [number, number][] = [];
      visiblePoints.forEach((point) => {
        bounds.push([point.latitude, point.longitude]);
        L.circleMarker([point.latitude, point.longitude], {
          radius: 9, color: "#fff", weight: 3, fillColor: colors[point.kind], fillOpacity: 1,
        }).addTo(map).bindPopup(`<strong>${escapeHtml(point.title)}</strong><br>${escapeHtml(point.detail)}`);
      });
      if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
      destroy = () => map.remove();
    });
    return () => { disposed = true; destroy(); };
  }, [visiblePoints]);

  return <div className="interactive-map">
    <div className="map-filters" aria-label="Filtros del mapa">
      <button className={visibleKinds.includes("sede")?"active":""} onClick={()=>toggleKind("sede")}><i className="sede"/> Sedes <b>{points.filter(point=>point.kind==="sede").length}</b></button>
      <button className={visibleKinds.includes("reclamo")?"active":""} onClick={()=>toggleKind("reclamo")}><i className="reclamo"/> Reclamos <b>{points.filter(point=>point.kind==="reclamo").length}</b></button>
      <button className={visibleKinds.includes("referente")?"active":""} onClick={()=>toggleKind("referente")}><i className="referente"/> Referentes <b>{points.filter(point=>point.kind==="referente").length}</b></button>
    </div>
    <div className="leaflet-map" ref={elementRef} aria-label="Mapa territorial interactivo de sedes, reclamos y referentes" />
  </div>;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char] ?? char));
}
