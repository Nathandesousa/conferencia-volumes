/* ===== Estado ===== */
var state = {
    volumes: [],            // lista de volumes [1..total]
    registrados: {},        // vol -> true
    semEtiqueta: 0,         // contador de caixas sem etiqueta
    total: 0,
    nf: '',
    scanner: null,
    scanAtivo: false,
    historicoCarregado: [],
    confirmadoFinalizar: false
};

var dbKEY = 'conferencia_historico';

/* ===== Referencias DOM ===== */
function $(id) { return document.getElementById(id); }
var screens = {
    setup: $('screen-setup'),
    conferencia: $('screen-conference'),
    report: $('screen-report'),
    historico: $('screen-historico')
};

/* ===== Logo ===== */
function carregarLogo() {
    var img = $('logoImg');
    img.src = 'nicosia.jpg';
    img.onerror = function () { img.style.display = 'none'; };
}

/* ===== Navegacao ===== */
function showScreen(name) {
    var chaves = Object.keys(screens);
    for (var i = 0; i < chaves.length; i++) {
        screens[chaves[i]].classList.remove('active');
    }
    screens[name].classList.add('active');
}

/* ===== Setup / resumo ===== */
$('numNotas').addEventListener('input', atualizarResumo);
$('volsNota').addEventListener('input', atualizarResumo);

function atualizarResumo() {
    var numNotas = parseInt($('numNotas').value) || 0;
    var volsNota = parseInt($('volsNota').value) || 0;
    var total = numNotas * volsNota;
    $('setupSummary').innerHTML = total > 0 ? '<strong>' + total + '</strong> volumes no total' : 'Preencha os campos acima';
}

$('btnIniciar').addEventListener('click', iniciar);

function iniciar() {
    var numNotas = parseInt($('numNotas').value) || 0;
    var volsNota = parseInt($('volsNota').value) || 0;
    var listas = [];

    if (numNotas <= 0) { alert('Informe a quantidade de notas'); return; }
    if (volsNota <= 0) { alert('Informe os volumes por nota'); return; }

    for (var n = 0; n < numNotas; n++) {
        for (var w = 1; w <= volsNota; w++) listas.push(w + n * volsNota);
    }

    if (listas.length === 0) { alert('Nenhum volume gerado'); return; }

    state.volumes = listas;
    state.total = listas.length;
    state.registrados = {};
    state.semEtiqueta = 0;
    state.nf = formatarDataHora(new Date());

    montarGrade();
    atualizarContadores();
    mostrarFeedback('', '');

    $('nfBadge').textContent = state.nf;
    $('inputCodigo').value = '';
    showScreen('conferencia');
    $('progressTotal').textContent = state.total;
    $('inputCodigo').focus();
}

/* ===== Grade ===== */
function montarGrade() {
    var grid = $('grid');
    grid.innerHTML = '';
    for (var i = 0; i < state.volumes.length; i++) {
        var cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.vol = state.volumes[i];
        cell.textContent = state.volumes[i];
        grid.appendChild(cell);
    }
}

function atualizarGrade() {
    var cells = document.querySelectorAll('.cell');
    for (var i = 0; i < cells.length; i++) {
        if (state.registrados[parseInt(cells[i].dataset.vol)]) {
            cells[i].classList.add('ok');
        }
    }
}

function atualizarContadores() {
    var ok = Object.keys(state.registrados).length;
    var falta = state.total - ok;
    $('progressCount').textContent = ok;
    $('statOk').textContent = ok;
    $('statFalta').textContent = falta;
    $('statSem').textContent = state.semEtiqueta;
    var pct = state.total > 0 ? (ok / state.total * 100) : 0;
    $('progressFill').style.width = pct + '%';
}

function mostrarFeedback(msg, tipo) {
    var fb = $('feedback');
    fb.textContent = msg;
    fb.className = 'feedback' + (tipo ? ' ' + tipo : '');
}

function vibrar() {
    if (navigator.vibrate) navigator.vibrate(60);
}

function formatarDataHora(d) {
    var dd = ('0' + d.getDate()).slice(-2);
    var mm = ('0' + (d.getMonth() + 1)).slice(-2);
    var aa = d.getFullYear();
    var hh = ('0' + d.getHours()).slice(-2);
    var mi = ('0' + d.getMinutes()).slice(-2);
    return dd + '/' + mm + '/' + aa + ' ' + hh + ':' + mi;
}

/* ===== Registro de volume ===== */
function registrar(entrada) {
    entrada = (entrada || '').trim();
    if (!entrada) return;
    var vol = parseInt(entrada);
    if (isNaN(vol)) { mostrarFeedback('Digite o numero do volume', 'err'); return; }
    if (vol < 1) { mostrarFeedback('Volume invalido: ' + vol, 'err'); return; }
    if (entrada.length > 6) { mostrarFeedback('Esse parece ser o codigo da caixa. Digite o VOL.', 'err'); return; }
    if (vol > state.total) { mostrarFeedback('Volume ' + vol + ' nao existe (max ' + state.total + ')', 'err'); return; }
    if (state.registrados[vol]) { mostrarFeedback('Volume ' + vol + ' ja registrado', 'dup'); vibrar(); return; }

    state.registrados[vol] = true;
    atualizarGrade();
    atualizarContadores();
    mostrarFeedback('Volume ' + vol + ' registrado', 'ok');
    vibrar();

    if (Object.keys(state.registrados).length === state.total) {
        setTimeout(function () { finishConfirmation(); }, 400);
    }
}

$('inputCodigo').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.keyCode === 13) {
        registrar($('inputCodigo').value);
        $('inputCodigo').value = '';
    }
});

/* ===== Caixa sem etiqueta ===== */
$('btnSemEtiqueta').addEventListener('click', function () { abrirModalSem(); });

function abrirModalSem() {
    $('modalSem').classList.add('active');
}

$('btnModalCancel').addEventListener('click', function () { $('modalSem').classList.remove('active'); });
$('btnModalConfirm').addEventListener('click', function () {
    $('modalSem').classList.remove('active');
    state.semEtiqueta++;
    atualizarContadores();
    mostrarFeedback('Caixa sem etiqueta registrada (' + state.semEtiqueta + ')', 'semEtiqueta');
    vibrar();
});

/* ===== Escaneamento ===== */
$('btnScan').addEventListener('click', toggleScan);

function toggleScan() {
    if (state.scanAtivo) { pararScan(); return; }
    iniciarScan();
}

function iniciarScan() {
    if (typeof Html5Qrcode === 'undefined') {
        alert('Escaneador nao carregou. Use a digitacao manual.');
        return;
    }
    $('scanArea').classList.remove('hidden');
    $('btnScan').textContent = 'PARAR';

    var scanner = new Html5Qrcode('scanArea');
    scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 200, height: 110 } },
        function (decodedText) {
            registrarScanFormatado(decodedText);
            scanner.stop().then(function () { pararScanUI(); }).catch(function () {});
        },
        function () {}
    ).then(function () {
        state.scanner = scanner;
        state.scanAtivo = true;
    }).catch(function (err) {
        alert('Erro ao abrir a camera: ' + err);
        pararScanUI();
    });
}

function registrarScanFormatado(decoded) {
    var num = parseInt(decoded);
    if (isNaN(num)) { mostrarFeedback('Codigo lido. Digite o VOL correspondente.', 'err'); return; }
    if (num >= 1 && num <= state.total) {
        registrar(String(num));
    } else {
        $('inputCodigo').value = decoded;
        mostrarFeedback('Codigo da caixa. Digite o VOL.', 'err');
    }
}

function pararScan() {
    if (state.scanner) { state.scanner.stop().catch(function () {}); state.scanner = null; }
    pararScanUI();
}

function pararScanUI() {
    state.scanAtivo = false;
    $('scanArea').classList.add('hidden');
    $('scanArea').innerHTML = '';
    $('btnScan').textContent = 'SCAN';
    $('inputCodigo').focus();
}

/* ===== Voltar setup ===== */
$('btnVoltar').addEventListener('click', function () {
    pararScan();
showScreen('setup');
carregarLogo();
});

/* ===== Finalizar / Relatorio ===== */
$('btnFinalizar').addEventListener('click', function () { finishConfirmation(); });

function finishConfirmation() {
    pararScan();
    var ok = Object.keys(state.registrados).length;
    var falta = state.total - ok;
    var listaFalta = [];
    var listaOk = [];
    for (var i = 0; i < state.volumes.length; i++) {
        var v = state.volumes[i];
        if (state.registrados[v]) listaOk.push(v); else listaFalta.push(v);
    }

    $('reportNf').textContent = 'Conferencia de ' + formatarDataHora(new Date());
    $('reportSummary').innerHTML = falta === 0
        ? '<strong>Sucesso!</strong><br>Todos os <strong>' + state.total + '</strong> volumes foram registrados.'
        : 'Registrados: <strong>' + ok + '</strong> de ' + state.total + '<br>Faltando: <strong style="color:#d64545">' + falta + '</strong> volumes';

    var divFalta = $('reportFalta');
    var divOk = $('reportOk');
    var divSem = $('reportSem');
    divFalta.innerHTML = '';
    divOk.innerHTML = '';
    divSem.innerHTML = '';

    if (!listaFalta.length) {
        divFalta.innerHTML = '<span class="badge ok">Nenhum faltando</span>';
    } else {
        for (var j = 0; j < listaFalta.length; j++) {
            var b = document.createElement('span');
            b.className = 'badge';
            b.textContent = 'Vol ' + listaFalta[j];
            divFalta.appendChild(b);
        }
    }

    if (state.semEtiqueta === 0) {
        divSem.innerHTML = '<span class="badge ok">Nenhuma</span>';
    } else {
        for (var s = 0; s < state.semEtiqueta; s++) {
            var bs = document.createElement('span');
            bs.className = 'badge sem';
            bs.textContent = 'Sem etiqueta ' + (s + 1);
            divSem.appendChild(bs);
        }
    }

    for (var k = 0; k < listaOk.length; k++) {
        var bo = document.createElement('span');
        bo.className = 'badge ok';
        bo.textContent = 'Vol ' + listaOk[k];
        divOk.appendChild(bo);
    }

    showScreen('report');
}

/* ===== Exportar TXT ===== */
$('btnExportar').addEventListener('click', exportarTXT);

function exportarTXT() {
    var falta = [];
    for (var i = 0; i < state.volumes.length; i++) if (!state.registrados[state.volumes[i]]) falta.push(state.volumes[i]);
    var ok = Object.keys(state.registrados).length;

    var txt = '=== RELATORIO DE CONFERENCIA ===\n';
    txt += 'NF: ' + state.nf + '\n';
    txt += 'Data: ' + new Date().toLocaleString() + '\n';
    txt += 'Total: ' + state.total + '\n';
    txt += 'Registrados: ' + ok + '\n';
    txt += 'Faltando: ' + falta.length + '\n';
    txt += 'Sem etiqueta: ' + state.semEtiqueta + '\n\n';
    txt += 'VOLUMES FALTANDO:\n' + (falta.join(', ') || 'Nenhum') + '\n\n';
    txt += 'SEM ETIQUETA: ' + state.semEtiqueta + '\n';

    var blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    var link = document.createElement('a');
    var nome = state.nf.replace(/[\/:]/g, '-').replace(/\s+/g, '_');
    link.href = URL.createObjectURL(blob);
    link.download = 'conferencia_' + nome + '.txt';
    link.click();
    URL.revokeObjectURL(link.href);
}

/* ===== Historico (localStorage) ===== */
var HIST_KEY = 'conf_hist_v2';

function carregarHistorico() {
    try {
        var d = localStorage.getItem(HIST_KEY);
        return d ? JSON.parse(d) : [];
    } catch (e) { return []; }
}

function salvarNoHistorico() {
    var ok = Object.keys(state.registrados).length;
    var falta = state.total - ok;
    var faltaLista = [];
    for (var i = 0; i < state.volumes.length; i++) if (!state.registrados[state.volumes[i]]) faltaLista.push(state.volumes[i]);

    var item = {
        nf: state.nf,
        data: new Date().toISOString(),
        total: state.total,
        ok: ok,
        falta: falta,
        sem: state.semEtiqueta,
        faltaLista: faltaLista
    };

    var hist = carregarHistorico();
    hist.unshift(item);
    localStorage.setItem(HIST_KEY, JSON.stringify(hist));
    alert('Conferencia salva no historico!');
}

$('btnSalvarHist').addEventListener('click', salvarNoHistorico);

$('btnVerHistorico').addEventListener('click', function () {
    renderHistorico();
    showScreen('historico');
});

$('btnVoltarHist').addEventListener('click', function () { showScreen('setup'); });

$('btnNova').addEventListener('click', function () { showScreen('setup'); });

function renderHistorico() {
    var hist = carregarHistorico();
    var list = $('histList');
    list.innerHTML = '';
    if (!hist.length) {
        list.innerHTML = '<div class="empty-state">Nenhuma conferencia salva ainda.</div>';
        return;
    }
    for (var i = 0; i < hist.length; i++) {
        var h = hist[i];
        var div = document.createElement('div');
        div.className = 'hist-item ' + (h.falta === 0 ? 'done' : 'pendente');

        var data = new Date(h.data);
        var dataStr = data.toLocaleDateString() + ' ' + data.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        div.innerHTML = '<div class="hist-top">' +
            '<span class="hist-nf">' + escapar(h.nf) + '</span>' +
            '<button class="btn-excluir-hist" data-idx="' + i + '">&times;</button>' +
            '</div>' +
            '<div class="hist-data">' + dataStr + '</div>' +
            '<div class="hist-info">' +
            '<span class="ok">' + h.ok + ' ok</span>' +
            '<span class="falta">' + h.falta + ' faltando</span>' +
            '<span class="sem">' + h.sem + ' sem etiqueta</span>' +
            '</div>';

        list.appendChild(div);
    }

    // excluir
    var botoes = list.querySelectorAll('.btn-excluir-hist');
    for (var b = 0; b < botoes.length; b++) {
        botoes[b].addEventListener('click', function (e) {
            e.stopPropagation();
            var idx = parseInt(this.dataset.idx);
            var histNow = carregarHistorico();
            histNow.splice(idx, 1);
            localStorage.setItem(HIST_KEY, JSON.stringify(histNow));
            renderHistorico();
        });
    }
}

function escapar(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

showScreen('setup');
