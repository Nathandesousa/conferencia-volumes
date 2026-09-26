/* ===== Estado ===== */
var state = {
    volumes: [],
    registrados: {},
    duplicados: [],
    semEtiqueta: 0,
    total: 0,
    nf: '',
    ultimoRegistro: null,       // { tipo, vol } para desfazer
    config: { som: true, vibrar: true },
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
        if (d) state.config = Object.assign({ som: true, vibrar: true }, JSON.parse(d));
    } catch (e) {}
    $('cfgSom').checked = state.config.som;
    $('cfgVibrar').checked = state.config.vibrar;
}
function salvarConfig() {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(state.config));
}
$('cfgSom').addEventListener('change', function () { state.config.som = this.checked; salvarConfig(); });
$('cfgVibrar').addEventListener('change', function () { state.config.vibrar = this.checked; salvarConfig(); });
$('btnConfig').addEventListener('click', function () { showScreen('config'); });
$('btnVoltarConfig').addEventListener('click', function () { showScreen('setup'); });

(function tornarLinhasConfigClicaveis() {
    var linhas = document.querySelectorAll('#screen-config .config-row');
    for (var i = 0; i < linhas.length; i++) {
        (function (linha) {
            var checkbox = linha.querySelector('input[type="checkbox"]');
            if (!checkbox) return;
            linha.addEventListener('click', function (e) {
                if (e.target === checkbox || e.target.classList.contains('slider')) return;
                checkbox.checked = !checkbox.checked;
                var ev = new Event('change', { bubbles: true });
                checkbox.dispatchEvent(ev);
            });
        })(linhas[i]);
    }
})();

/* ===== Setup / notas ===== */
$('numNotas').addEventListener('input', renderNotas);

function valoresNotaAtuais() {
    var vals = [];
    var inputs = document.querySelectorAll('#notasLista input');
    for (var i = 0; i < inputs.length; i++) vals.push(inputs[i].value);
    return vals;
}

function renderNotas() {
    var antigos = valoresNotaAtuais();
    var qtd = parseInt($('numNotas').value) || 0;
    if (qtd < 1) qtd = 1;
    if (qtd > 50) qtd = 50;
    $('numNotas').value = qtd;
    var lista = $('notasLista');
    lista.innerHTML = '';
    for (var i = 1; i <= qtd; i++) {
        var wrap = document.createElement('div');
        wrap.className = 'field';
        var rotulo = document.createElement('label');
        rotulo.setAttribute('for', 'notaVol' + i);
        rotulo.textContent = 'Volumes da nota ' + i;
        var inp = document.createElement('input');
        inp.type = 'number';
        inp.min = '1';
        inp.id = 'notaVol' + i;
        inp.placeholder = 'Ex: 50';
        inp.setAttribute('inputmode', 'numeric');
        if (antigos[i - 1] !== undefined) inp.value = antigos[i - 1];
        inp.addEventListener('input', atualizarResumo);
        wrap.appendChild(rotulo);
        wrap.appendChild(inp);
        lista.appendChild(wrap);
    }
    atualizarResumo();
}

function lerNotas() {
    var inputs = document.querySelectorAll('#notasLista input');
    if (!inputs.length) return null;
    var lista = [];
    for (var i = 0; i < inputs.length; i++) {
        var v = parseInt(inputs[i].value);
        if (isNaN(v) || v <= 0) return null;
        lista.push(v);
    }
    return lista;
}

function atualizarResumo() {
    var inputs = document.querySelectorAll('#notasLista input');
    var total = 0;
    for (var i = 0; i < inputs.length; i++) {
        var v = parseInt(inputs[i].value);
        if (isNaN(v) || v <= 0) {
            $('setupSummary').innerHTML = 'Preencha os volumes de cada nota';
            return;
        }
        total += v;
    }
    if (!inputs.length) {
        $('setupSummary').innerHTML = 'Preencha os volumes de cada nota';
        return;
    }
    $('setupSummary').innerHTML = '<strong>' + inputs.length + '</strong> nota(s) &middot; <strong>' + total + '</strong> volumes no total';
}

$('btnIniciar').addEventListener('click', iniciar);

function iniciar() {
    if (state.emAndamento) {
        if (!confirmar('Ja existe uma conferencia em andamento. Iniciar nova e descartar a atual?')) return;
    }
    var porNota = lerNotas();
    if (!porNota || !porNota.length) { alert('Preencha os volumes de cada nota'); return; }

    var listas = [];
    var offset = 0;
    for (var n = 0; n < porNota.length; n++) {
        for (var w = 1; w <= porNota[n]; w++) listas.push(w + offset);
        offset += porNota[n];
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
        cell.addEventListener('click', function () {
            var vol = parseInt(this.dataset.vol);
            if (!state.registrados[vol] && state.duplicados.indexOf(vol) === -1) return;
            removerVolume(vol);
        });
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
        if (cls !== 'cell') {
            cells[i].title = 'Clique para remover o volume ' + cells[i].dataset.vol;
        } else {
            cells[i].removeAttribute('title');
        }
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

function processarEntrada(valor) {
    valor = (valor || '').trim();
    registrar(valor, false);
}

$('inputCodigo').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.keyCode === 13) {
        processarEntrada($('inputCodigo').value);
        $('inputCodigo').value = '';
    }
});
$('btnConfirmar').addEventListener('click', function () {
    processarEntrada($('inputCodigo').value);
    $('inputCodigo').value = '';
    $('inputCodigo').focus();
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

function removerVolume(vol) {
    if (!confirmar('Remover o volume ' + vol + ' da conferencia?')) return;

    delete state.registrados[vol];
    state.duplicados = state.duplicados.filter(function (item) { return item !== vol; });
    state.ultimoRegistro = null;
    atualizarGrade();
    atualizarContadores();
    mostrarFeedback('Volume ' + vol + ' removido', 'cancel');
    somConfirma();
}

/* ===== Voltar setup ===== */
$('btnVoltar').addEventListener('click', function () {
    if (state.emAndamento) {
        if (!confirmar('Sair da conferencia? Os volumes ainda nao registrados serao perdidos.')) return;
    }
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
    linhas.push(['VOLUME', 'CODIGO CAIXA', 'STATUS']);
    for (var i = 0; i < state.volumes.length; i++) {
        var vol = state.volumes[i];
        var status = state.registrados[vol] ? 'Registrado' : 'Faltando';
        if (state.duplicados.indexOf(vol) !== -1) {
            status = 'Repetido';
        }
        linhas.push([vol, '', status]);
    }
    linhas.push([]);
    linhas.push(['CAIXAS SEM ETIQUETA', state.semEtiqueta]);

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
carregarConfig();
renderNotas();
showScreen('setup');
