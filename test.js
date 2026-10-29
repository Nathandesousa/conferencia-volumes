const XLSX = require("xlsx");
const path = require("path");
const P = require(path.join(__dirname, "..", "lib", "processar"));

const arquivo = "C:\\Users\\usuario\\Desktop\\plano\\ConsultaPedidos_2b9cdfc1-bc4e-4dae-a459-67411f7e04d3.xlsx";

function carregar(p) {
  const wb = XLSX.readFile(p);
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
}

const aoa = carregar(arquivo);
console.log("Total de linhas (com cabeçalho):", aoa.length);
console.log("Cabeçalho:", JSON.stringify(aoa[0]));

const DATA_TESTE = process.argv[2] || "2026-09-09";
const pedidos = P.processarPedidos(aoa, { data: DATA_TESTE });

const porSituacao = {};
const porTipo = {};
pedidos.forEach(p => {
  porSituacao[p.situacao] = (porSituacao[p.situacao] || 0) + 1;
  porTipo[p.tipo] = (porTipo[p.tipo] || 0) + 1;
});
console.log("\nSituaçãoComercial:", porSituacao);
console.log("Tipo de Entrega:", porTipo);

const sugAuto = pedidos.filter(p => p.sugestaoEntrega);
console.log("\nSugeridos para entrega (auto):", sugAuto.length);

const porCidadeAuto = {};
sugAuto.forEach(p => {
  const c = P.norm(p.cidade);
  porCidadeAuto[c] = (porCidadeAuto[c] || 0) + 1;
});
console.log("Por cidade (auto):", porCidadeAuto);

// Simula o dia escolhido na linha de comando (padrão 09/09/2026)
const data = DATA_TESTE;
const entregaDireta = pedidos.map(p => ({ ...p }));
entregaDireta.forEach(p => p.entrega = p.sugestaoEntrega);
const resumo = P.sugerirDivisao(entregaDireta, data, false);
console.log("\nDia:", resumo.diaSemana, "| rota:", resumo.cidadesDia.join(", "));
console.log("Total entrega:", resumo.totalEntrega);
console.log("Excede capacidade:", resumo.excedeCapacidade);
console.log("Resumo motoristas:", resumo.resumo);

// Verifica cidades fora da rota do dia
const cidadesRota = resumo.cidadesDia;
const fora = entregaDireta.filter(p => p.entrega && P.norm(p.cidade) !== P.CID.VIDEIRA && !cidadesRota.includes(P.norm(p.cidade)));
console.log("\nPedidos fora da rota do dia (quarta):");
fora.forEach(p => console.log(`  ${p.nota} | ${p.cidade} | ${p.bairro}`));

// Lista os primeiros de cada motorista
["MARCOS", "REALIZA", "MARTINAZZO", "JADLOG"].forEach(m => {
  const lista = entregaDireta.filter(p => p.entrega && p.motorista === m);
  console.log(`\n${m} (${lista.length}):`);
  lista.slice(0, 5).forEach(p => console.log(`  ${p.nota} | ${p.cidade} | ${p.bairro}`));
  if (lista.length > 5) console.log(`  ... mais ${lista.length - 5}`);
});