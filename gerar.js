const XLSX = require("xlsx");
const path = require("path");
const P = require(path.join(__dirname, "..", "lib", "processar"));

const wbFile = XLSX.readFile("C:\\Users\\usuario\\Desktop\\plano\\ConsultaPedidos_2b9cdfc1-bc4e-4dae-a459-67411f7e04d3.xlsx");
const ws = wbFile.Sheets[wbFile.SheetNames[0]];
const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

const pedidos = P.processarPedidos(aoa);
pedidos.forEach(p => p.entrega = p.sugestaoEntrega);
P.sugerirDivisao(pedidos, "2026-09-15", false);

const buffer = P.gerarWorkbook(pedidos, "2026-09-15");
require("fs").writeFileSync(path.join(__dirname, "..", "output-teste.xlsx"), buffer);

const wbOut = XLSX.read(buffer, { type: "buffer" });
console.log("Abas geradas:", wbOut.SheetNames);
for (const nome of wbOut.SheetNames) {
  const wsOut = wbOut.Sheets[nome];
  const linhas = XLSX.utils.sheet_to_json(wsOut, { header: 1, defval: "" });
  console.log(`\n[${nome}] ${linhas.length} linhas`);
  if (nome !== "FECHAMENTO") {
    console.log("  Cabeçalho:", JSON.stringify(linhas[0]));
    console.log("  Linha 1:", JSON.stringify(linhas[1]));
  } else {
    linhas.forEach(l => console.log("  ", JSON.stringify(l)));
  }
}