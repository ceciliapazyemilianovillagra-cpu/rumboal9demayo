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

export function TerritoryMap({ points, onCreateHeadquarters }: { points: MapPoint[]; onCreateHeadquarters?: (location:{latitude:number;longitude:number})=>void }) {
  const elementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const [visibleKinds,setVisibleKinds]=useState<MapPoint["kind"][]>(["sede","reclamo","referente"]);
  const [picked,setPicked]=useState<[number,number]|null>(null);
  const [mapMessage,setMapMessage]=useState("Tocá el mapa para consultar una coordenada.");
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

      const streets=L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {attribution:"© OpenStreetMap",maxZoom:19});
      const clear=L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png", {attribution:"© OpenStreetMap © CARTO",maxZoom:20});
      const satellite=L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {attribution:"Imágenes © Esri",maxZoom:19});
      streets.addTo(map);
      L.control.layers({"Calles y nombres":streets,"Mapa claro":clear,"Vista satelital":satellite},undefined,{position:"topright",collapsed:true}).addTo(map);

      const colors = { sede: "#2d2d49", reclamo: "#d66253", referente: "#2d8f70" };
      visiblePoints.forEach((point) => {
        L.circleMarker([point.latitude, point.longitude], {
          radius: 9, color: "#fff", weight: 3, fillColor: colors[point.kind], fillOpacity: 1,
        }).addTo(map).bindPopup(`<strong>${escapeHtml(point.title)}</strong><br>${escapeHtml(point.detail)}`);
      });
      let pickedMarker: ReturnType<typeof L.circleMarker>|null=null;
      map.on("click",event=>{
        const coordinate:[number,number]=[event.latlng.lat,event.latlng.lng];
        setPicked(coordinate);
        setMapMessage(`Coordenada seleccionada: ${coordinate[0].toFixed(6)}, ${coordinate[1].toFixed(6)}`);
        if(pickedMarker)pickedMarker.remove();
        pickedMarker=L.circleMarker(coordinate,{radius:7,color:"#fff",weight:3,fillColor:"#f2a33a",fillOpacity:1}).addTo(map).bindPopup("Ubicación seleccionada").openPopup();
      });
      window.setTimeout(() => map.invalidateSize(), 0);
      destroy = () => {
        mapRef.current = null;
        map.remove();
      };
    });
    return () => { disposed = true; destroy(); };
  }, [visiblePoints]);

  function locateMe(){
    if(!navigator.geolocation)return setMapMessage("Este dispositivo no permite obtener la ubicación.");
    setMapMessage("Buscando tu ubicación...");
    navigator.geolocation.getCurrentPosition(position=>{
      const coordinate:[number,number]=[position.coords.latitude,position.coords.longitude];
      setPicked(coordinate);mapRef.current?.setView(coordinate,16);setMapMessage("Mapa centrado en tu ubicación actual.");
    },()=>setMapMessage("No se pudo obtener la ubicación."),{enableHighAccuracy:true,timeout:12000});
  }

  function fitAll(){
    const map=mapRef.current;
    if(!map||!visiblePoints.length)return setMapMessage("No hay puntos visibles para encuadrar.");
    void import("leaflet").then(L=>map.fitBounds(L.latLngBounds(visiblePoints.map(point=>[point.latitude,point.longitude])),{padding:[35,35],maxZoom:16}));
  }

  return <div className="interactive-map">
    <div className="map-filters" aria-label="Filtros del mapa">
      <button className={visibleKinds.includes("sede")?"active":""} onClick={()=>toggleKind("sede")}><i className="sede"/> Sedes <b>{points.filter(point=>point.kind==="sede").length}</b></button>
      <button className={visibleKinds.includes("reclamo")?"active":""} onClick={()=>toggleKind("reclamo")}><i className="reclamo"/> Reclamos <b>{points.filter(point=>point.kind==="reclamo").length}</b></button>
      <button className={visibleKinds.includes("referente")?"active":""} onClick={()=>toggleKind("referente")}><i className="referente"/> Referentes <b>{points.filter(point=>point.kind==="referente").length}</b></button>
      <button type="button" className="map-home" onClick={()=>mapRef.current?.setView(SAN_MIGUEL_DE_TUCUMAN,TUCUMAN_ZOOM)}>⌖ San Miguel de Tucumán</button>
    </div>
    <div className="leaflet-map" ref={elementRef} aria-label="Mapa territorial interactivo de sedes, reclamos y referentes" />
    <div className="map-tools"><span>{mapMessage}</span><div><button type="button" onClick={locateMe}>◎ Mi ubicación</button><button type="button" onClick={fitAll}>⊙ Ver todos los puntos</button>{picked&&<button type="button" onClick={()=>void navigator.clipboard.writeText(`${picked[0].toFixed(6)}, ${picked[1].toFixed(6)}`)}>Copiar coordenada</button>}{picked&&onCreateHeadquarters&&<button type="button" className="map-create-headquarters" onClick={()=>onCreateHeadquarters({latitude:picked[0],longitude:picked[1]})}>＋ Crear sede aquí</button>}</div></div>
  </div>;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char] ?? char));
}
