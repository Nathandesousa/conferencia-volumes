const XLSX = require("xlsx");
const path = require("path");
const P = require(path.join(__dirname, "..", "lib", "processar"));

console.log("Serial do 09/09/2026 (esperado ~46274):", P.serialExcel(P.parseDataISO("2026-09-09")));
console.log("Serial do 01/09/2026 (esperado ~46266):", P.serialExcel(P.parseDataISO("2026-09-01")));

// Notas que estavam na planilha de controle real no dia 46274 (09/09)
const notasReais = {
  MARCOS: [158823,158897,158837,158861,158859,158832,158830,158850,158935,158895,158819,158855,158856,158889,158848,158886,159010,158964,159013,158993,158930,158934,158660,158936,158941,159014,158975,159018,158921,158932,158991,158974,159001,158940,158942,158943,158946,158935,159011,158973,159024,158947],
  REALIZA: [158965,158967,158998,158970,158944,158927,158952,158978,158954,158956,159009,158926,158979,158977,158929,158923],
  MARTINAZZO: [158908,158835,158827,158862,158962,159003,158963,158945,158939,158997,158922,158783,159000,158953,158935,158931,158959,158938,158966]
};

// Carrega faturados
const wb = XLSX.readFile("C:\\Users\\usuario\\Desktop\\plano\\ConsultaPedidos_2b9cdfc1-bc4e-4dae-a459-67411f7e04d3.xlsx");
const ws = wb.Sheets[wb.SheetNames[0]];
const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

const pedidos = P.processarPedidos(aoa);
const entrega = pedidos.filter(p => p.entrega);
console.log("\nTotal de pendentes (Transporte+Separação):", entrega.length);

for (const [mot, notas] of Object.entries(notasReais)) {
  const encontradas = notas.filter(n => entrega.some(p => String(p.nota).trim() === String(n)));
  const faltam = notas.filter(n => !entrega.some(p => String(p.nota).trim() === String(n)));
  console.log(`\n${mot}: encontrei ${encontradas.length}/${notas.length} nas pendentes`);
  if (faltam.length) console.log("  NÃO pendentes:", faltam.join(", "));
}

// As notas da planilha real estão todas no faturado?
const todasReais = [].concat(...Object.values(notasReais));
const noFaturado = todasReais.filter(n => pedidos.some(p => String(p.nota).trim() === String(n)));
console.log("\nNotas reais presentes no faturado:", noFaturado.length, "/", todasReais.length);