$node = "C:\Program Files\nodejs\node.exe"
$p = Start-Process -FilePath $node -ArgumentList "server.js" -WorkingDirectory "C:\Users\usuario\Documents\Default Project" -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 3

try {
  $homeResp = Invoke-WebRequest -Uri "http://localhost:3000/" -UseBasicParsing
  Write-Host "GET / -> $($homeResp.StatusCode), bytes: $($homeResp.Content.Length)"

  $corpo = @{
    data = "2026-09-15"
    pedidos = @(
      @{ nota="159045"; pessoa="26661529"; nome="CAMILA APARECIDA CARNEIRO"; valor=2421.68; tipo="No endereço de entrega"; situacao="Transporte"; dataCaptacao="09/09/2026"; dataFaturamento="09/09/2026"; plano="Pix à Vista"; bairro="FLORESTA"; cidade="VIDEIRA"; codModelo="1"; codEstrutura="11.289"; estrutura=""; motorista="REALIZA" },
      @{ nota="158850"; pessoa="16083835"; nome="JOSELIANA GOMES DE ARAUJO"; valor=400.5; tipo="No endereço de entrega"; situacao="Transporte"; dataCaptacao="04/09/2026"; dataFaturamento="04/09/2026"; plano="Pix à Vista"; bairro="SÃO SEBASTIÃO"; cidade="FRAIBURGO"; codModelo="1"; codEstrutura="817"; estrutura=""; motorista="MARCOS" }
    )
  } | ConvertTo-Json -Depth 5

  $resp = Invoke-WebRequest -Uri "http://localhost:3000/api/gerar" -Method POST -ContentType "application/json" -Body $corpo -UseBasicParsing
  Write-Host "POST /api/gerar -> $($resp.StatusCode), tipo: $($resp.Headers['Content-Type']), tamanho: $($resp.RawContentLength)"
} catch {
  Write-Host "ERRO: $($_.Exception.Message)"
} finally {
  Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
  Write-Host "Servidor encerrado."
}