"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";

const SAN_MIGUEL_DE_TUCUMAN: [number, number] = [-26.8083, -65.2176];
const TUCUMAN_ZOOM = 13;

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
  const mapRef = useRef<LeafletMap | null>(null);
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
      const map = L.map(elementRef.current, { zoomControl: true, preferCanvas: true })
        .setView(SAN_MIGUEL_DE_TUCUMAN, TUCUMAN_ZOOM);
      mapRef.current = map;

      L.tileLayer("/api/map-tiles/{z}/{x}/{y}", {
        attribution: "© OpenStreetMap contributors © CARTO",
        maxZoom: 19,
        keepBuffer: 3,
        updateWhenIdle: true,
      }).addTo(map);

      const colors = { sede: "#2d2d49", reclamo: "#d66253", referente: "#2d8f70" };
      visiblePoints.forEach((point) => {
        L.circleMarker([point.latitude, point.longitude], {
          radius: 9, color: "#fff", weight: 3, fillColor: colors[point.kind], fillOpacity: 1,
        }).addTo(map).bindPopup(`<strong>${escapeHtml(point.title)}</strong><br>${escapeHtml(point.detail)}`);
      });
      window.setTimeout(() => map.invalidateSize(), 0);
      destroy = () => {
        mapRef.current = null;
        map.remove();
      };
    });
    return () => { disposed = true; destroy(); };
  }, [visiblePoints]);

  return <div className="interactive-map">
    <div className="map-filters" aria-label="Filtros del mapa">
      <button className={visibleKinds.includes("sede")?"active":""} onClick={()=>toggleKind("sede")}><i className="sede"/> Sedes <b>{points.filter(point=>point.kind==="sede").length}</b></button>
      <button className={visibleKinds.includes("reclamo")?"active":""} onClick={()=>toggleKind("reclamo")}><i className="reclamo"/> Reclamos <b>{points.filter(point=>point.kind==="reclamo").length}</b></button>
      <button className={visibleKinds.includes("referente")?"active":""} onClick={()=>toggleKind("referente")}><i className="referente"/> Referentes <b>{points.filter(point=>point.kind==="referente").length}</b></button>
      <button type="button" className="map-home" onClick={()=>mapRef.current?.setView(SAN_MIGUEL_DE_TUCUMAN,TUCUMAN_ZOOM)}>⌖ San Miguel de Tucumán</button>
    </div>
    <div className="leaflet-map" ref={elementRef} aria-label="Mapa territorial interactivo de sedes, reclamos y referentes" />
  </div>;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char] ?? char));
}
