/* ===== URL biblioteca HTML5 QR ===== */
var QR_URL = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';

/* ===== Estado ===== */
var state = {
    volumes: [],
    registrados: {},
    duplicados: [],
    semEtiqueta: 0,
    total: 0,
    nf: '',
    scanner: null,
    scanAtivo: false,
    ultimoRegistro: null,       // { tipo, vol } para desfazer
    config: { continuo: false, som: true, vibrar: true },
    wakeLock: null,
    emAndamento: false,
    dupPendente: null
};

var dbKEY = 'conferencia_historico';
var CONFIG_KEY = 'conf_config_v1';

/* ===== Referencias DOM ===== */
function $(id) { return document.getElementById(id); }
var screens = {
    setup: $('screen-setup'),
    config: $('screen-config'),
    conferencia: $('screen-conference'),
    report: $('screen-report'),
    historico: $('screen-historico')
};

/* ===== Navegacao ===== */
function showScreen(name) {
    var chaves = Object.keys(screens);
    for (var i = 0; i < chaves.length; i++) {
        screens[chaves[i]].classList.remove('active');
    }
    if (screens[name]) screens[name].classList.add('active');
}

/* ===== Som (WebAudio) ===== */
var ctx = null;
function audio() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
}
function beep(freq, dur, tipo) {
    if (!state.config.som) return;
    var a = audio();
    if (!a) return;
    var osc = a.createOscillator();
    var gain = a.createGain();
    osc.type = tipo || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.12, a.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    osc.connect(gain);
    gain.connect(a.destination);
    osc.start();
    osc.stop(a.currentTime + dur);
}
function somOk() { beep(880, 0.15); }
function somErro() { beep(220, 0.25, 'sawtooth'); }
function somDup() { beep(520, 0.12); setTimeout(function(){ beep(660, 0.15); }, 120); }
function somConfirma() { beep(700, 0.12); setTimeout(function(){ beep(1000, 0.18); }, 130); }

function vibrar(ms) {
    if (!state.config.vibrar) return;
    if (navigator.vibrate) navigator.vibrate(ms || 60);
}

/* ===== Wake Lock (tela sempre acesa) ===== */
function pedirWakeLock() {
    if ('wakeLock' in navigator) {
        navigator.wakeLock.request('screen').then(function (wl) {
            state.wakeLock = wl;
        }).catch(function () {});
    }
}
function soltarWakeLock() {
    if (state.wakeLock) { try { state.wakeLock.release(); } catch (e) {} state.wakeLock = null; }
}
document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && state.emAndamento) pedirWakeLock();
});

/* ===== Configuracoes ===== */
function carregarConfig() {
    try {
        var d = localStorage.getItem(CONFIG_KEY);
        if (d) state.config = Object.assign({ continuo: false, som: true, vibrar: true }, JSON.parse(d));
    } catch (e) {}
    $('cfgContinuo').checked = state.config.continuo;
    $('cfgSom').checked = state.config.som;
    $('cfgVibrar').checked = state.config.vibrar;
}
function salvarConfig() {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(state.config));
}
function aplicarDisableSemConfirm() {
    if (state.config.continuo) { $('btnScan').textContent = 'PARAR'; } else { $('btnScan').textContent = 'SCAN'; }
}
$('cfgContinuo').addEventListener('change', function () { state.config.continuo = this.checked; salvarConfig(); aplicarDisableSemConfirm(); });
$('cfgSom').addEventListener('change', function () { state.config.som = this.checked; salvarConfig(); });
$('cfgVibrar').addEventListener('change', function () { state.config.vibrar = this.checked; salvarConfig(); });
$('btnConfig').addEventListener('click', function () { showScreen('config'); });
$('btnVoltarConfig').addEventListener('click', function () { showScreen('setup'); });

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
    if (state.emAndamento) {
        if (!confirmar('Ja existe uma conferencia em andamento. Iniciar nova e descartar a atual?')) return;
    }
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
    state.duplicados = [];
    state.semEtiqueta = 0;
    state.ultimoRegistro = null;
    state.nf = formatarDataHora(new Date());
    state.emAndamento = true;

    montarGrade();
    atualizarContadores();
    mostrarFeedback('', '');
    limparGradeCores();

    $('nfBadge').textContent = state.nf;
    $('inputCodigo').value = '';
    showScreen('conferencia');
    $('progressTotal').textContent = state.total;
    $('inputCodigo').focus();
    pedirWakeLock();
}

function confirmar(msg) {
    return window.confirm(msg);
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

function limparGradeCores() {
    var cells = document.querySelectorAll('.cell');
    for (var i = 0; i < cells.length; i++) cells[i].className = 'cell';
}

function atualizarGrade() {
    var cells = document.querySelectorAll('.cell');
    for (var i = 0; i < cells.length; i++) {
        var cls = 'cell';
        if (state.registrados[parseInt(cells[i].dataset.vol)]) cls += ' ok';
        if (state.duplicados.indexOf(parseInt(cells[i].dataset.vol)) !== -1) cls += ' dup';
        cells[i].className = cls;
    }
}

function atualizarContadores() {
    var ok = Object.keys(state.registrados).length;
    var faltantes = calcularFaltantes();
    var faltaReal = faltantes.length - state.semEtiqueta;
    if (faltaReal < 0) faltaReal = 0;
    $('progressCount').textContent = ok;
    $('statOk').textContent = ok;
    $('statFalta').textContent = faltaReal;
    $('statSem').textContent = state.semEtiqueta;
    $('statDup').textContent = state.duplicados.length;
    var pct = state.total > 0 ? (ok / state.total * 100) : 0;
    $('progressFill').style.width = pct + '%';
    atualizarAvisoSemEtiqueta();
    atualizarAvisoExcesso();
}

/* ===== Deduzir caixa(s) sem etiqueta ===== */
function calcularFaltantes() {
    var falta = [];
    for (var i = 0; i < state.volumes.length; i++) {
        if (!state.registrados[state.volumes[i]]) falta.push(state.volumes[i]);
    }
    return falta;
}
function faltantesReais() {
    var faltantes = calcularFaltantes();
    var cobertos = state.semEtiqueta + state.duplicados.length;
    var rest = faltantes.length - cobertos;
    return rest > 0 ? rest : 0;
}
function excessoCaixas() {
    var faltantes = calcularFaltantes();
    var cobertos = state.semEtiqueta + state.duplicados.length;
    var ex = cobertos - faltantes.length;
    return ex > 0 ? ex : 0;
}
function atualizarAvisoExcesso() {
    var el = $('avisoExcesso');
    if (!el) return;
    var ex = excessoCaixas();
    if (ex === 0) { el.classList.add('hidden'); return; }
    el.innerHTML = 'Atencao: tem <strong>' + ex + '</strong> caixa(s) a mais! (nada faltando para cobrir)';
    el.classList.remove('hidden');
}
function atualizarAvisoSemEtiqueta() {
    var el = $('avisoSemEtiqueta');
    if (!el) return;
    var sem = state.semEtiqueta;
    var dups = state.duplicados.length;
    var faltantes = calcularFaltantes();
    var cobertos = sem + dups;
    if (sem === 0 || faltantes.length === 0) { el.classList.add('hidden'); return; }
    if (cobertos >= faltantes.length) {
        var listaCobertos = [];
        for (var i2 = 0; i2 < faltantes.length; i2++) listaCobertos.push(faltantes[i2]);
        var extra = '';
        if (dups > 0) extra = ' (incluindo os <strong>' + dups + '</strong> repetido(s))';
        el.innerHTML = 'Completo! Os volumes que faltavam foram cobertos pelas sem etiqueta e/ou repetidos: <strong>' + listaCobertos.join(', ') + '</strong>' + extra;
        el.classList.remove('hidden');
        return;
    }
    if (sem > faltantes.length) { el.classList.add('hidden'); return; }
    var texto;
    if (sem === 1) {
        texto = 'A caixa sem etiqueta e a volume <strong>' + faltantes[0] + '</strong>';
    } else {
        texto = 'As caixas sem etiqueta podem ser as volumes: <strong>' + faltantes.join(', ') + '</strong>';
    }
    el.innerHTML = texto;
    el.classList.remove('hidden');
}

function mostrarFeedback(msg, tipo) {
    var fb = $('feedback');
    fb.textContent = msg;
    fb.className = 'feedback' + (tipo ? ' ' + tipo : '');
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
function registrar(entrada, isDupConfirm) {
    entrada = (entrada || '').trim();
    if (!entrada) return;
    var vol = parseInt(entrada);

    if (isNaN(vol)) { mostrarFeedback('Digite o numero do volume', 'err'); somErro(); return; }
    if (vol < 1) { mostrarFeedback('Volume invalido: ' + vol, 'err'); somErro(); return; }
    if (entrada.length > 6) { mostrarFeedback('Esse parece ser o codigo da caixa. Digite o VOL.', 'err'); somErro(); return; }
    if (vol > state.total) { mostrarFeedback('Volume ' + vol + ' nao existe (max ' + state.total + ')', 'err'); somErro(); return; }

    if (state.registrados[vol]) {
        if (isDupConfirm) {
            state.duplicados.push(vol);
            state.ultimoRegistro = { tipo: 'dup', vol: vol };
            fecharModalDup();
            atualizarGrade();
            atualizarContadores();
            mostrarFeedback('Volume ' + vol + ' registrado como repetido', 'dupOk');
            somDup();
            vibrar(100);
        } else {
            abrirModalDup(vol);
        }
        return;
    }

    state.registrados[vol] = true;
    state.ultimoRegistro = { tipo: 'ok', vol: vol };
    atualizarGrade();
    atualizarContadores();
    mostrarFeedback('Volume ' + vol + ' registrado', 'ok');
    somOk();
    vibrar();

    if (Object.keys(state.registrados).length === state.total) {
        setTimeout(function () { finishConfirmation(); }, 400);
    }
}

$('inputCodigo').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.keyCode === 13) {
        registrar($('inputCodigo').value, false);
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
    state.ultimoRegistro = { tipo: 'sem' };
    atualizarContadores();
    mostrarFeedback('Caixa sem etiqueta registrada (' + state.semEtiqueta + ')', 'semEtiqueta');
    somConfirma();
    vibrar();
});

/* ===== Volume repetido (modal) ===== */
function abrirModalDup(vol) {
    state.dupPendente = vol;
    $('modalDupMsg').textContent = 'O volume ' + vol + ' ja foi registrado. Registrar como repetido (duplicado)?';
    $('modalDup').classList.add('active');
    somDup();
}
function fecharModalDup() {
    $('modalDup').classList.remove('active');
    state.dupPendente = null;
}
$('btnDupCancel').addEventListener('click', function () {
    fecharModalDup();
    mostrarFeedback('Registro repetido cancelado', 'cancel');
});
$('btnDupConfirm').addEventListener('click', function () {
    if (state.dupPendente !== null) registrar(String(state.dupPendente), true);
});

/* ===== Desfazer ultimo ===== */
$('btnDesfazer').addEventListener('click', function () {
    if (!state.ultimoRegistro) { mostrarFeedback('Nada para desfazer', 'err'); return; }
    var u = state.ultimoRegistro;
    if (u.tipo === 'ok') {
        delete state.registrados[u.vol];
        mostrarFeedback('Desfeito: volume ' + u.vol, 'cancel');
    } else if (u.tipo === 'dup') {
        var i = state.duplicados.indexOf(u.vol);
        if (i !== -1) state.duplicados.splice(i, 1);
        mostrarFeedback('Desfeito: repetido ' + u.vol, 'cancel');
    } else if (u.tipo === 'sem') {
        state.semEtiqueta = Math.max(0, state.semEtiqueta - 1);
        mostrarFeedback('Desfeito: caixa sem etiqueta', 'cancel');
    }
    state.ultimoRegistro = null;
    atualizarGrade();
    atualizarContadores();
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
    usarScan();
}

function usarScan() {
    $('scanArea').classList.remove('hidden');
    $('btnScan').textContent = 'PARAR';

    var scanner = new Html5Qrcode('scanArea');
    scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 200, height: 110 } },
        function (decodedText) {
            onDecoded(decodedText);
            if (!state.config.continuo) {
                scanner.stop().then(function () { pararScanUI(); }).catch(function () {});
            }
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

function onDecoded(decoded) {
    var num = parseInt(decoded);
    if (isNaN(num)) {
        mostrarFeedback('Codigo lido. Digite o VOL correspondente.', 'err');
        somErro();
        return;
    }
    if (num >= 1 && num <= state.total) {
        registrar(String(num), false);
    } else {
        $('inputCodigo').value = decoded;
        mostrarFeedback('Codigo da caixa. Digite o VOL.', 'err');
        somErro();
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
    if (state.config.continuo) { $('btnScan').textContent = 'PARAR'; } else { $('btnScan').textContent = 'SCAN'; }
    $('inputCodigo').focus();
}

/* ===== Voltar setup ===== */
$('btnVoltar').addEventListener('click', function () {
    if (state.emAndamento) {
        if (!confirmar('Sair da conferencia? Os volumes ainda nao registrados serao perdidos.')) return;
    }
    pararScan();
    soltarWakeLock();
    state.emAndamento = false;
    showScreen('setup');
});

/* ===== Finalizar / Relatorio ===== */
$('btnFinalizar').addEventListener('click', function () { prepararFinalizar(); });

function prepararFinalizar() {
    var falta = faltantesReais();
    if (falta > 0) {
        $('modalFinMsg').textContent = 'Ainda faltam ' + falta + ' volumes. Deseja finalizar mesmo assim?';
        $('modalFin').classList.add('active');
    } else {
        finishConfirmation();
    }
}

$('btnFinCancel').addEventListener('click', function () { $('modalFin').classList.remove('active'); });
$('btnFinConfirm').addEventListener('click', function () {
    $('modalFin').classList.remove('active');
    finishConfirmation();
});

function finishConfirmation() {
    pararScan();
    soltarWakeLock();
    state.emAndamento = false;
    var ok = Object.keys(state.registrados).length;
    var listaFalta = [];
    var listaOk = [];
    for (var i = 0; i < state.volumes.length; i++) {
        var v = state.volumes[i];
        if (state.registrados[v]) listaOk.push(v); else listaFalta.push(v);
    }
    var faltaReal = faltantesReais();

    $('reportNf').textContent = 'Conferencia de ' + formatarDataHora(new Date());
    $('reportSummary').innerHTML = faltaReal === 0
        ? '<strong>Sucesso!</strong><br>Todos os <strong>' + state.total + '</strong> volumes conferidos (' + state.semEtiqueta + ' sem etiqueta).'
        : 'Registrados: <strong>' + ok + '</strong> de ' + state.total + '<br>Faltando: <strong style="color:#d64545">' + faltaReal + '</strong> volumes<br>Sem etiqueta: <strong>' + state.semEtiqueta + '</strong><br>Repetidos: <strong>' + state.duplicados.length + '</strong>';

    var divFalta = $('reportFalta');
    var divOk = $('reportOk');
    var divSem = $('reportSem');
    divFalta.innerHTML = '';
    divOk.innerHTML = '';
    divSem.innerHTML = '';

    if (faltaReal === 0) {
        divFalta.innerHTML = '<span class="badge ok">Nenhum faltando</span>';
    } else {
        var faltasReais = montarFalta();
        for (var j = 0; j < faltasReais.length; j++) {
            var b = document.createElement('span');
            b.className = 'badge';
            b.textContent = 'Vol ' + faltasReais[j];
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

    reportSemAvisoFill();
    reportDupFill();
    reportExcessoFill();

    showScreen('report');
}

function reportSemAvisoFill() {
    var el = $('reportSemAviso');
    var sem = state.semEtiqueta;
    var dups = state.duplicados.length;
    var faltantes = calcularFaltantes();
    var cobertos = sem + dups;
    if (sem === 0) { el.innerHTML = ''; return; }
    if (cobertos >= faltantes.length && faltantes.length > 0) {
        var extra = '';
        if (dups > 0) extra = ' (incluindo ' + dups + ' repetido(s))';
        el.innerHTML = 'Completo: os volumes que faltavam foram cobertos pelas sem etiqueta e/ou repetidos: <strong>' + faltantes.join(', ') + '</strong>' + extra + '.';
        return;
    }
    if (sem > faltantes.length) {
        el.innerHTML = '<strong>' + sem + '</strong> caixas sem etiqueta: nao da para deduzir quais sao (mais sem etiqueta que volumes faltando).';
        return;
    }
    if (sem === 1) {
        el.innerHTML = 'A caixa sem etiqueta e o volume <strong>' + faltantes[0] + '</strong>.';
    } else {
        el.innerHTML = 'As <strong>' + sem + '</strong> caixas sem etiqueta podem ser as volumes: <strong>' + faltantes.join(', ') + '</strong> (nao da para dizer qual e qual).';
    }
}

function reportDupFill() {
    var reportDup = $('reportDup');
    reportDup.innerHTML = '';
    if (!state.duplicados.length) {
        reportDup.innerHTML = '<span class="badge ok">Nenhum repetido</span>';
        return;
    }
    for (var d = 0; d < state.duplicados.length; d++) {
        var bd = document.createElement('span');
        bd.className = 'badge dup';
        bd.textContent = 'Vol ' + state.duplicados[d];
        reportDup.appendChild(bd);
    }
}

function reportExcessoFill() {
    var el = $('reportExcesso');
    var ex = excessoCaixas();
    if (ex === 0) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.innerHTML = 'Atencao: <strong>' + ex + '</strong> caixa(s) a mais foram recebidas (nao ha volume faltando para cobrir). Verifique se nao veio caixa trocada ou de outra nota.';
}

function montarFalta() {
    var falta = calcularFaltantes();
    var cobertos = state.semEtiqueta + state.duplicados.length;
    if (cobertos >= falta.length) return [];
    return falta.slice(cobertos);
}

/* ===== Exportar Excel (CSV) ===== */
$('btnExcel').addEventListener('click', exportarExcel);

function exportarExcel() {
    var falta = montarFalta();
    var ok = Object.keys(state.registrados).length;
    var linhas = [];
    linhas.push(['RELATORIO DE CONFERENCIA']);
    linhas.push(['NF', state.nf]);
    linhas.push(['Data', new Date().toLocaleString()]);
    linhas.push(['Total', state.total]);
    linhas.push(['Registrados', ok]);
    linhas.push(['Faltando', falta.length]);
    linhas.push(['Repetidos', state.duplicados.length]);
    linhas.push(['Sem etiqueta', state.semEtiqueta]);
    linhas.push([]);
    linhas.push(['VOLUME', 'STATUS']);
    for (var i = 0; i < state.volumes.length; i++) {
        var vol = state.volumes[i];
        var status = state.registrados[vol] ? 'Registrado' : 'Faltando';
        if (state.duplicados.indexOf(vol) !== -1) status = 'Repetido';
        linhas.push([vol, status]);
    }

    var csv = '\uFEFF';
    for (var r = 0; r < linhas.length; r++) {
        csv += linhas[r].map(function (c) {
            c = String(c == null ? '' : c);
            if (c.indexOf(',') !== -1 || c.indexOf('"') !== -1 || c.indexOf('\n') !== -1) {
                c = '"' + c.replace(/"/g, '""') + '"';
            }
            return c;
        }).join(';') + '\r\n';
    }

    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    var nome = state.nf.replace(/[\/:]/g, '-').replace(/\s+/g, '_');
    link.download = 'conferencia_' + nome + '.csv';
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
    var falta = faltantesReais();
    var faltaLista = montarFalta(); var dupLista = state.duplicados.slice();

    var item = {
        nf: state.nf,
        data: new Date().toISOString(),
        total: state.total,
        ok: ok,
        falta: falta,
        sem: state.semEtiqueta,
        dup: dupLista.length,
        faltaLista: faltaLista
    };

    var hist = carregarHistorico();
    hist.unshift(item);
    localStorage.setItem(HIST_KEY, JSON.stringify(hist));
    somConfirma();
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
            '<span class="sem">' + (h.sem || 0) + ' sem etiqueta</span>' +
            '<span class="dup">' + (h.dup || 0) + ' repetido</span>' +
            '</div>';

        list.appendChild(div);
    }

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

/* ===== Inicializacao ===== */
function carregarQR() {
    if (typeof Html5Qrcode !== 'undefined' || window.Html5Qrcode) return;
    var s = document.createElement('script');
    s.src = QR_URL;
    s.onload = function () {};
    s.onerror = function () { console.log('QR nao carregou offline'); };
    document.body.appendChild(s);
}

carregarConfig();
carregarQR();
atualizarResumo();
showScreen('setup');
