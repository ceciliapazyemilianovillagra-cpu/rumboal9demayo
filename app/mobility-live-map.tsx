"use client";
import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";

type Point={id:string;name:string;status:string;latitude?:number|null;longitude?:number|null;detail:string};
const colors:Record<string,string>={pendiente:"#7b8494",buscada:"#e6a621",en_destino:"#268bd2",regresada:"#23956d"};
export function MobilityLiveMap({points}:{points:Point[]}){
 const ref=useRef<HTMLDivElement>(null),map=useRef<LeafletMap|null>(null);
 useEffect(()=>{if(!ref.current)return;let disposed=false;void import("leaflet").then(L=>{if(disposed||!ref.current)return;const instance=L.map(ref.current,{zoomControl:true}).setView([-26.8083,-65.2176],13);map.current=instance;L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"© OpenStreetMap",maxZoom:19}).addTo(instance);const valid=points.filter(point=>typeof point.latitude==="number"&&typeof point.longitude==="number");valid.forEach(point=>L.circleMarker([point.latitude!,point.longitude!],{radius:10,color:"#fff",weight:3,fillColor:colors[point.status]||colors.pendiente,fillOpacity:1}).addTo(instance).bindPopup(`<strong>${safe(point.name)}</strong><br>${safe(point.detail)}`));if(valid.length)instance.fitBounds(L.latLngBounds(valid.map(point=>[point.latitude!,point.longitude!])),{padding:[30,30],maxZoom:15});window.setTimeout(()=>instance.invalidateSize(),100);});return()=>{disposed=true;map.current?.remove();map.current=null;};},[points]);
 return <div className="mobility-map"><div ref={ref}/>{!points.some(point=>typeof point.latitude==="number"&&typeof point.longitude==="number")&&<p>El mapa mostrará los vehículos cuando registren su primer avance con ubicación.</p>}</div>;
}
function safe(value:string){return value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]||char));}
