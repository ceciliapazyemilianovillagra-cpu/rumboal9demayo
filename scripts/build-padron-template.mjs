import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "outputs/primera-entrega-padron";
await fs.mkdir(outputDir, { recursive: true });

const workbook = Workbook.create();
const padron = workbook.worksheets.add("Padron");
const instrucciones = workbook.worksheets.add("Instrucciones");

padron.showGridLines = false;
padron.mergeCells("A1:L1");
padron.getRange("A1").values = [["RUMBO AL 9 DE MAYO · MODELO DE PADRÓN ELECTORAL"]];
padron.getRange("A2:L2").merge();
padron.getRange("A2").values = [["Completá una fila por persona cuando la organización electoral entregue el padrón oficial. No modifiques los encabezados."]];
padron.getRange("A4:L4").values = [[
  "dni", "apellido_y_nombre", "fecha_nacimiento", "domicilio", "barrio", "circuito",
  "seccion", "mesa", "orden", "establecimiento", "direccion_establecimiento", "observaciones",
]];
padron.getRange("A5:L5").values = [[
  "", "", "", "", "", "", "", "", "", "", "", "",
]];
padron.getRange("A1:L1").format = { fill: "#172B62", font: { bold: true, color: "#FFFFFF", size: 15 }, horizontalAlignment: "center", verticalAlignment: "center" };
padron.getRange("A2:L2").format = { fill: "#E8F4FA", font: { color: "#24304F", italic: true, size: 10 }, wrapText: true, verticalAlignment: "center" };
padron.getRange("A4:L4").format = { fill: "#38A8D9", font: { bold: true, color: "#FFFFFF", size: 10 }, wrapText: true, horizontalAlignment: "center", verticalAlignment: "center", borders: { preset: "outside", style: "thin", color: "#1B789E" } };
padron.getRange("A5:L5").format = { fill: "#F7FBFD", borders: { preset: "outside", style: "thin", color: "#D7E5EB" } };
padron.getRange("A1:L1").format.rowHeight = 28;
padron.getRange("A2:L2").format.rowHeight = 34;
padron.getRange("A4:L4").format.rowHeight = 34;
const widths = [14, 30, 17, 30, 20, 14, 14, 12, 12, 30, 34, 32];
widths.forEach((width, column) => { padron.getRangeByIndexes(0, column, 6, 1).format.columnWidth = width; });
padron.getRange("C5").format.numberFormat = "yyyy-mm-dd";
padron.freezePanes.freezeRows(4);
padron.tables.add("A4:L5", true, "PadronModelo");

instrucciones.showGridLines = false;
instrucciones.mergeCells("A1:D1");
instrucciones.getRange("A1").values = [["GUÍA DE CARGA DEL PADRÓN"]];
instrucciones.getRange("A3:D8").values = [
  ["Paso", "Qué hacer", "Importante", ""],
  ["1", "Guardar una copia de este archivo.", "Usá una copia por cada importación.", ""],
  ["2", "Completar la hoja Padron.", "No cambies el nombre de la hoja ni los encabezados.", ""],
  ["3", "Conservar solamente información entregada oficialmente.", "No agregar valoraciones, afinidad política ni datos sensibles no autorizados.", ""],
  ["4", "Usar fecha con formato AAAA-MM-DD.", "Ejemplo: 1990-05-09.", ""],
  ["5", "Subir el archivo desde el módulo Votantes.", "La app revisará el formato antes de incorporar información.", ""],
];
instrucciones.getRange("A1:D1").format = { fill: "#172B62", font: { bold: true, color: "#FFFFFF", size: 15 }, horizontalAlignment: "center", verticalAlignment: "center" };
instrucciones.getRange("A3:D3").format = { fill: "#F3A640", font: { bold: true, color: "#172B62" }, horizontalAlignment: "center" };
instrucciones.getRange("A3:D8").format.borders = { preset: "inside", style: "thin", color: "#D7E5EB" };
instrucciones.getRange("A4:D8").format = { fill: "#FBFCFE", wrapText: true, verticalAlignment: "center", borders: { preset: "inside", style: "thin", color: "#D7E5EB" } };
instrucciones.getRange("A1:D1").format.rowHeight = 28;
instrucciones.getRange("A3:D8").format.rowHeight = 34;
[10, 42, 58, 4].forEach((width, column) => { instrucciones.getRangeByIndexes(0, column, 9, 1).format.columnWidth = width; });

const preview = await workbook.render({ sheetName: "Padron", autoCrop: "all", scale: 1, format: "png" });
await fs.writeFile(`${outputDir}/preview-padron.png`, new Uint8Array(await preview.arrayBuffer()));
const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(`${outputDir}/plantilla-padron.xlsx`);
