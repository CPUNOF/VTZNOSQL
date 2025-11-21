// ============================================================
// SISTEMA VTZ - VERSÃO HÍBRIDA
// ============================================================

const API_URL = '/api/produtos';

document.addEventListener('DOMContentLoaded', () => {
    checkLogin();
    loadProductsFromAPI();
    renderLogs();
    updateAlertsAndSales();
    setupOnlineStatus();
});

function checkLogin() {
    const token = localStorage.getItem('vtzToken');
    const role = localStorage.getItem('userRole');
    const userEmail = localStorage.getItem('loggedUser'); // <--- 1. PEGAMOS O E-MAIL AQUI

    if (!token || !role) {
        window.location.href = "/Login.html";
        return;
    }

    // --- ATUALIZA AS VARIÁVEIS GLOBAIS ---
    authToken = token;
    currentUserRole = role;
    
    // AQUI ESTAVA FALTANDO: Atualiza a identidade para o Log usar!
    if (userEmail) {
        currentUser = userEmail; 
    }

    // --- ATUALIZA O CABEÇALHO ---
    const headerUser = document.getElementById('usuarioAtualHeader');
    const roleBadge = document.getElementById('roleBadge');

    if (headerUser) {
        headerUser.value = currentUser; // Usa a variável atualizada
    }

    if (roleBadge) {
        const roleText = (currentUserRole === 'admin') ? 'ADMIN' : 'FUNCIONÁRIO';
        roleBadge.innerText = roleText;

        if (currentUserRole === 'admin') {
            roleBadge.style.background = '#f41414ff';
            roleBadge.style.color = '#333';
        } else {
            roleBadge.style.background = 'rgba(255, 255, 255, 0.15)';
            roleBadge.style.color = 'white';
        }
    }

    // --- MOSTRAR BOTÕES ADMIN (Sua lógica mantida) ---
    const btnRegister = document.getElementById('btnRegister');
    const btnAdminPanel = document.getElementById('btnAdminPanel');

    const isAdmin = (currentUserRole === 'admin');

    if (btnRegister) {
        btnRegister.style.display = isAdmin ? 'flex' : 'none';
    }
    if (btnAdminPanel) {
        btnAdminPanel.style.display = isAdmin ? 'flex' : 'none';
    }
}


function uid(prefix = 'id') { return prefix + '_' + Math.random().toString(36).slice(2, 10); }

// Local: Bloco de constantes
const KEY_PRODUCTS = 'vtz_produtos_cache'; // Chave nova para o cache de produtos
const KEY_SYNC_QUEUE = 'vtz_sync_queue'; // Chave nova para a fila de pedidos offline
const KEY_LOGS = 'vtz_logs';
const KEY_SALES = 'vtz_vendas';

// Produtos agora começam vazios até chegarem da API
let products = [];
let syncQueue = JSON.parse(localStorage.getItem(KEY_SYNC_QUEUE) || '[]') || []; // Carrega a fila de sincronização
let logs = JSON.parse(localStorage.getItem(KEY_LOGS) || '[]') || [];
let sales = JSON.parse(localStorage.getItem(KEY_SALES) || '[]') || [];

let storedUser = localStorage.getItem('vtz_user');
let currentUserRole = localStorage.getItem('userRole') || 'funcionario';
let currentUser = storedUser || (document.getElementById('usuarioAtualHeader') && document.getElementById('usuarioAtualHeader').value) || 'admin';
let currentSearch = '';
let currentDetailProductIndex = null;
let sellingIndex = null;
let editingIndex = null;
let authToken = localStorage.getItem('vtzToken') || null;

function showLoading() {
    document.getElementById('loadingOverlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

// Função auxiliar para gerar o cabeçalho de autenticação
const getAuthHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`
});

// ============================================================
// 1. NOVA CAMADA DE API (CONEXÃO COM MONGODB)
// ============================================================

async function loadProductsFromAPI() {
    try {
        showLoading()
        updateStatusIndicator('sincronizando');
        // Tenta API
        const res = await fetch(API_URL, { headers: getAuthHeaders() });

        if (!res.ok) {
            // Se falhar (e NÃO for erro 401/403, que é falha de login), tenta o cache
            if (res.status !== 401 && res.status !== 403 && loadProductsFromCache()) {
                updateStatusIndicator('offline');
                console.log("API falhou, usando cache.");
                return; // Usa o cache local
            }
            // Se for 401/403, manda pra tela de login
            if (res.status === 401 || res.status === 403) {
                window.location.href = "/Login.html";
                return;
            }
            throw new Error('Erro ao buscar dados');
            hideLoading()
        }

        // Se API deu sucesso, usa os dados, salva no cache e tenta sincronizar
        const dadosBanco = await res.json();
        products = dadosBanco.map(p => ({ ...p, id: p._id, _id: p._id }));
        saveProductsToCache(); // Salva cache

        // Tenta sincronizar a fila que sobrou (se houver)
        await syncLoop();

        renderProductList();
        updateDashboard();
        updateAlertsAndSales();
        updateStatusIndicator('online');
        hideLoading()
    } catch (error) {
        showLoading()
        console.error("Erro API:", error);
        updateStatusIndicator('offline');
        // Se a API falhar completamente (ex: Node.js fora), tenta carregar do cache
        if (!loadProductsFromCache()) {
            alert("⚠️ Não foi possível carregar o estoque. Verifique sua conexão e o servidor.");
        }
        hideLoading()
    }
}

async function syncProductToAPI(produto, isNew = false) {
    
    // 1. Prepara a requisição
    const url = isNew ? API_URL : `${API_URL}/${produto._id || produto.id}`;
    const method = isNew ? 'POST' : 'PUT';

    // 2. TENTA SALVAR LOCALMENTE (GARANTE QUE A AÇÃO FOI FEITA VISUALMENTE)
    // Se for um produto novo, ele não terá _id. Adicione um temporário para a fila
    const produtoParaCache = { ...produto, _id: produto._id || uid('temp') };

    // 3. Verifica a conexão
    if (!navigator.onLine) {
        // MODO OFFLINE (SALVA NA FILA E CACHE)
        console.log("🔴 OFFLINE DETECTADO: Salvando requisição na fila.");
        updateStatusIndicator('offline');

        // Adiciona a requisição na fila
        syncQueue.push({ url, method, body: produtoParaCache });
        saveSyncQueue();

        // Adiciona/Atualiza o produto no cache local para o usuário ver
        if (isNew) products.push(produtoParaCache);
        else products = products.map(p => p._id === produtoParaCache._id ? produtoParaCache : p);
        saveProductsToCache();

        return true; // Retorna sucesso (pois salvamos localmente)
    }

    // MODO ONLINE (TENTA API)
    try {
        showLoading()
        updateStatusIndicator('sincronizando');

        const res = await fetch(url, {
            method: method,
            headers: getAuthHeaders(),
            body: JSON.stringify(produto)
        });

        if (!res.ok) throw new Error('Falha ao salvar');

        // Se deu sucesso na API, recarrega a lista do Mongo (source of truth)
        await loadProductsFromAPI();
        return true;
        hideLoading()
    } catch (error) {
        // Se a API falhar no meio do uso (ex: internet caiu no meio do PUT)
        showLoading()
        console.error("Erro ao salvar ONLINE, salvando na fila:", error);
        updateStatusIndicator('offline');

        // Salva a requisição falha na fila
        syncQueue.push({ url, method, body: produto });
        saveSyncQueue();

        return false; // Retorna falha
        hideLoading()
    }
}
// Função que roda quando a internet volta
async function syncLoop() {
    if (syncQueue.length === 0) {
        console.log("Fila de sincronização vazia.");
        return;
    }

    updateStatusIndicator('sincronizando');
    console.log(`📡 Sincronizando ${syncQueue.length} pedidos pendentes...`);

    let successCount = 0;
    const itemsToRetry = [];

    for (const item of syncQueue) {
        try {
            // Tenta enviar o pedido pendente
            const res = await fetch(item.url, {
                method: item.method,
                headers: getAuthHeaders(),
                body: JSON.stringify(item.body)
            });

            if (res.ok) {
                successCount++;
            } else if (res.status === 403) {
                // Erro 403: Permissão negada (não deve acontecer, mas se acontecer, não adianta tentar de novo)
                console.error(`Permissão negada para ${item.method} ${item.url}.`);
            } else {
                // Outro erro (Ex: 500, servidor fora), tenta de novo depois
                itemsToRetry.push(item);
            }
        } catch (e) {
            // Falha de rede no meio da sincronização. Guarda e tenta na próxima vez
            itemsToRetry.push(item);
        }
    }

    // Atualiza a fila
    syncQueue = itemsToRetry;
    saveSyncQueue();

    // Força carregar a lista fresca do banco e limpa o cache
    await loadProductsFromAPI();
    saveProductsToCache();

    console.log(`✅ Sincronização finalizada. Sucesso: ${successCount}. Pendentes: ${itemsToRetry.length}`);
    updateStatusIndicator('online');
}

async function deleteProductFromAPI(idMongo) {
    // Pega o cargo do usuário que está logado no navegador (para o Middleware do Backend)
    const cargoUsuario = localStorage.getItem('userRole') || 'funcionario';

    try {
        showLoading()
        updateStatusIndicator('sincronizando');
        const res = await fetch(`${API_URL}/${idMongo}`, {
            method: 'DELETE',
            headers: getAuthHeaders() // ADICIONA AUTORIZAÇÃO
        });

        // TRATAMENTO DA FALHA DE PERMISSÃO (403)
        if (res.status === 403) {
            alert("❌ Acesso Negado! Apenas Administradores podem remover produtos permanentemente.");
            // Não jogamos um erro de rede aqui, só um alerta de lógica
            updateStatusIndicator('online'); // Volta para verde, a rede está ok
            return false;
        }

        if (!res.ok) throw new Error('Falha ao deletar'); // Erro 500, etc.

        await loadProductsFromAPI();
        return true;
        hideLoading()
    } catch (error) {
        showLoading()
        console.error("Erro ao deletar:", error);

        // Se deu qualquer outro erro (ex: rede caiu ou servidor falhou), mostra offline
        alert("❌ Erro de conexão com o servidor ou falha interna.");
        updateStatusIndicator('offline');
        return false;
        hideLoading()
    }
}

// ============================================================
// 2. LÓGICA ORIGINAL
// ============================================================

// Função alterada para persistir APENAS Logs e Vendas localmente (Produtos ficam no Mongo)
function persistAll() {
    localStorage.setItem(KEY_LOGS, JSON.stringify(logs));
    localStorage.setItem(KEY_SALES, JSON.stringify(sales));
}
// Salva a lista MESTRA de produtos no cache do navegador (executada quando está online)
function saveProductsToCache() {
    localStorage.setItem(KEY_PRODUCTS, JSON.stringify(products));
}

// Salva a fila de pedidos pendentes (quando o sistema está offline)
function saveSyncQueue() {
    localStorage.setItem(KEY_SYNC_QUEUE, JSON.stringify(syncQueue));
}

// Processa o cache local no load (se a API falhar)
function loadProductsFromCache() {
    const cachedProducts = JSON.parse(localStorage.getItem(KEY_PRODUCTS) || '[]');
    if (cachedProducts.length > 0) {
        products = cachedProducts;
        renderProductList();
        updateDashboard();
        updateAlertsAndSales();
        console.log("📦 Produtos carregados do cache local (Offline Mode).");
        return true; // Sucesso
    }
    return false; // Falha
}

function esc(s) { if (s === null || s === undefined) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

async function addLogStructured(type, message, before = null, after = null, meta = null) {
    const entry = { 
        id: uid('log'), 
        ts: new Date().toISOString(), 
        user: currentUser, 
        type, 
        message, 
        before, 
        after, 
        meta 
    };
    
    // 1. Tenta salvar na API (Audit Trail)
    if (navigator.onLine) {
        try {
            await fetch('/api/logs', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(entry)
            });
        } catch (e) {
            console.warn("API de Logs falhou. Salvando log localmente.", e);
        }
    }

    // 2. Salva localmente (cache) e renderiza (Hybrid Fallback)
    logs.unshift(entry);
    if (logs.length > 1000) logs.length = 1000;
    persistAll();
    renderLogs();
}
function addLog(msg) { addLogStructured('info', msg); }

function renderLogs() {
    const el = document.getElementById('logList');
    if (!el) return;
    
    el.innerHTML = logs.map(l => {
        const time = new Date(l.ts).toLocaleString();
        let extraHtml = '';
        
        if (l.before !== null || l.after !== null) {
            extraHtml = `
                <div class="log-changes">
                    <span class="val-old">${esc(String(l.before || '-'))}</span>
                    <i class='bx bx-right-arrow-alt'></i>
                    <span class="val-new">${esc(String(l.after || '-'))}</span>
                </div>`;
        }

        // Ícone baseado no tipo de ação
        let icon = 'bx-info-circle';
        let colorClass = 'info';
        if(l.type.includes('venda')) { icon = 'bx-dollar-circle'; colorClass = 'success'; }
        if(l.type.includes('edit')) { icon = 'bx-pencil'; colorClass = 'warn'; }
        if(l.type.includes('remover')) { icon = 'bx-trash'; colorClass = 'danger'; }
        if(l.type.includes('import')) { icon = 'bx-import'; colorClass = 'primary'; }

        return `
            <div class="log-card ${colorClass}">
                <div class="log-icon"><i class='bx ${icon}'></i></div>
                <div class="log-content">
                    <div class="log-header">
                        <span class="log-user">${esc(l.user)}</span>
                        <span class="log-time">${time}</span>
                    </div>
                    <div class="log-msg">${esc(l.message)}</div>
                    ${extraHtml}
                </div>
            </div>`;
    }).join('');
}

function updateDashboard() {
    document.getElementById('cardProducts').innerText = products.length;
    document.getElementById('sideTotalCount').innerText = products.length;
    const totalQty = products.reduce((a, b) => a + (b.quantidade || 0), 0);
    document.getElementById('sideTotalQty').innerText = totalQty;
    // low stock threshold
    const lowThreshold = 5;
    const lowCount = products.filter(p => (p.quantidade || 0) <= lowThreshold).length;

    // ADAPTADO: Só verifica validade se o campo existir (Sua regra de ferro/arame)
    const expireCount = products.filter(p => {
        if (!p.validade) return false;
        const diff = (new Date(p.validade) - new Date()) / (1000 * 60 * 60 * 24);
        return diff >= 0 && diff <= 30;
    }).length;

    document.getElementById('sideLowCount').innerText = lowCount;
    document.getElementById('cardLow').innerText = lowCount;
    document.getElementById('sideExpireCount').innerText = expireCount;
    document.getElementById('cardExpire').innerText = expireCount;
}

function updateAlertsAndSales() {
    const alertsEl = document.getElementById('alertsList');
    alertsEl.innerHTML = '';
    const lowThreshold = 5;
    const lowItems = products.filter(p => (p.quantidade || 0) <= lowThreshold);
    const soonExpire = products.filter(p => {
        if (!p.validade) return false;
        const diff = (new Date(p.validade) - new Date()) / (1000 * 60 * 60 * 24);
        return diff >= 0 && diff <= 30;
    });
    // NOVO: Alerta de Produto Parado (Mais de 90 dias)
    const stagnantThresholdDays = 90; // Seu período configurável
    const stagnantItems = products.filter(p => {
        // 1. Deve ter uma data de entrada
        if (!p.entrada) return false;
        const entryDate = new Date(p.entrada);
        const today = new Date();

        // Calcula a diferença em dias
        const diffTime = Math.abs(today - entryDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // 2. Deve ter passado do limite E a quantidade ser maior que zero
        return diffDays > stagnantThresholdDays && (p.quantidade || 0) > 0;
    });


    lowItems.slice(0, 5).forEach(p => {
        const div = document.createElement('div');
        div.className = 'alert-item low'; // 
        div.innerText = `Baixo estoque: ${p.nome} • ${p.quantidade || 0} unidades`;
        div.onclick = () => { currentSearch = p.nome; document.getElementById('searchInput').value = p.nome; renderProductList(p.nome); };
        alertsEl.appendChild(div);
    });
    soonExpire.slice(0, 5).forEach(p => {
        const div = document.createElement('div');
        div.className = 'alert-item expiring'; // 
        div.innerText = `Vence em breve: ${p.nome} • validade: ${p.validade || '-'}`;
        div.onclick = () => { currentSearch = p.nome; document.getElementById('searchInput').value = p.nome; renderProductList(p.nome); };
        alertsEl.appendChild(div);
    });
    
    stagnantItems.slice(0, 5).forEach(p => {
        const div = document.createElement('div');
        div.className = 'alert-item warn'; // 
        div.innerText = `Produto parado: ${p.nome} há mais de ${stagnantThresholdDays} dias!`;
        div.onclick = () => { currentSearch = p.nome; document.getElementById('searchInput').value = p.nome; renderProductList(p.nome); };
        alertsEl.appendChild(div);
    });
    // Venda lista lateral
    const salesEl = document.getElementById('salesList');
    salesEl.innerHTML = '';
    sales.slice(0, 10).forEach(s => {
        const d = document.createElement('div');
        d.style.padding = '8px';
        d.style.borderBottom = '1px solid #eee';

        // NOVO LAYOUT: Mostra Produto, Qtd e Comprador
        d.innerHTML = `
            <div style="display:flex;justify-content:space-between;font-weight:700;font-size:13px">
                <span>${esc(s.produto)}</span>
                <span style="color:var(--green-2)">-${s.quantidade} un</span>
            </div>
            <div style="display:flex;justify-content:space-between;color:#666;font-size:11px;margin-top:2px">
                <span title="Comprador">👤 ${esc(s.comprador || 'Balcão')}</span>
                <span>${new Date(s.ts).toLocaleDateString()}</span>
            </div>
        `;
        salesEl.appendChild(d);
    });
}

function renderProductList(filterText = '') {
    const listEl = document.getElementById('productList');
    listEl.innerHTML = '';
    const normalizedFilter = (filterText || currentSearch || '').trim().toLowerCase();

    products.forEach((p, idx) => {
        // Filtro simples caso não use Fuse na busca global
        if (normalizedFilter) {
            const hay = `${p.nome} ${p.codigo || ''} ${p.localizacao || ''}`.toLowerCase();
            if (!hay.includes(normalizedFilter)) return;
        }
        const div = document.createElement('div');
        div.className = 'row-card';
        // Removido onclick da row inteira para evitar clique acidental

        div.innerHTML = `
        <div class="index-pill" title="Índice">${idx + 1}</div>
        <div class="thumb"><img title="Imagem do produto" src="${esc(p.imagem) || 'https://via.placeholder.com/140x90?text=SEM'}" alt="${esc(p.nome)}" /></div>
        
        <div class="col"><input title="Nome" value="${esc(p.nome)}" readonly style="font-weight:bold" /></div>
        <div class="col"><input title="Peso" value="${esc(p.peso || '')}" readonly /></div>
        <div class="col"><input title="Local" value="${esc(p.localizacao || '')}" readonly /></div>
        <div class="col"><input title="Código" value="${esc(p.codigo || '')}" readonly /></div>
        <div class="col"><input title="Entrada" type="date" value="${esc(p.entrada || '')}" readonly /></div>
        <div class="col"><input title="Validade" type="date" value="${esc(p.validade || '')}" readonly /></div>
        
        <div style="display:flex;flex-direction:column;gap:6px;align-items:center">
          <div class="qty">
            <button title="Diminuir" onclick="adjustQty(${idx}, -1)">-</button>
            <div style="min-width:20px;text-align:center;font-weight:500">${p.quantidade || 0}</div>
            <button title="Aumentar" onclick="adjustQty(${idx}, 1)">+</button>
          </div>
          <div style="display:flex;gap:6px;margin-top:6px">
            <div class="gear" title="Detalhar/Editar" onclick="openAddModal(${idx})">✏️</div>
            <div class="gear" title="Vender" onclick="openSell(${idx})">💰</div>
            <div class="gear" title="Remover" onclick="removeProduct(${idx})">🗑️</div>
          </div>
        </div>
      `;
        listEl.appendChild(div);
    });
    updateDashboard();
    updateAlertsAndSales();
}

async function adjustQty(index, delta) {
    const product = products[index];
    const before = product.quantidade || 0;
    let after = before + delta;
    if (after < 0) after = 0;

    // Atualização Otimista (muda na tela antes de confirmar)
    product.quantidade = after;
    renderProductList(currentSearch);

    // Salva no MongoDB
    const success = await syncProductToAPI(product, false); // false = edição

    if (success) {
        addLogStructured('quantidade', `Alterou quantidade de "${product.nome}"`, before, after, { productId: product.id });
    } else {
        // Se falhar, reverte
        product.quantidade = before;
        renderProductList(currentSearch);
    }
}

async function removeProduct(index) {
    const p = products[index];
    if (!confirm(`ATENÇÃO: Isso irá apagar "${p.nome}" do Banco de Dados PERMANENTEMENTE.\n(Apenas Admins podem fazer isso).\n\nConfirmar?`)) return;

    // Chama API Delete (usando _id ou id)
    const success = await deleteProductFromAPI(p._id || p.id);

    if (success) {
        addLogStructured('remover', `Removeu produto "${p.nome}"`, null, null, { productId: p.id });
        renderProductList(currentSearch);
    }
}

function openAddModal(editIdx = null) {
    editingIndex = (typeof editIdx === 'number') ? editIdx : null;
    document.getElementById('modalAddTitle').innerText = editingIndex === null ? 'Adicionar Produto' : 'Editar Produto';

    if (editingIndex !== null) {
        const p = products[editingIndex];
        document.getElementById('field_nome').value = p.nome || '';
        document.getElementById('field_peso').value = p.peso || '';
        document.getElementById('field_local').value = p.localizacao || '';
        document.getElementById('field_codigo').value = p.codigo || '';
        document.getElementById('field_entrada').value = p.entrada || '';
        document.getElementById('field_validade').value = p.validade || '';
        document.getElementById('field_quantidade').value = p.quantidade || 0;
        document.getElementById('field_imagem').value = p.imagem || '';
    } else {
        // Limpa tudo
        ['field_nome', 'field_peso', 'field_local', 'field_codigo', 'field_entrada', 'field_validade', 'field_imagem'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('field_quantidade').value = 1;
        document.getElementById('previewImg').style.display = 'none';
    }
    document.getElementById('modalAdd').style.display = 'flex';
}

function closeAddModal() {
    document.getElementById('modalAdd').style.display = 'none';
    editingIndex = null;
}

// FUNÇÃO SALVAR COM DETECÇÃO DE DUPLICIDADE
// FUNÇÃO SALVAR CORRIGIDA
async function saveProduct() {
    console.log("🟢 Botão Salvar clicado. Processando...");
    
    const nome = document.getElementById('field_nome').value.trim();
    const peso = document.getElementById('field_peso').value.trim();
    const localizacao = document.getElementById('field_local').value.trim();
    const codigo = document.getElementById('field_codigo').value.trim();
    const entrada = document.getElementById('field_entrada').value;
    const validade = document.getElementById('field_validade').value;
    const quantidade = parseInt(document.getElementById('field_quantidade').value) || 0;
    const imagem = document.getElementById('field_imagem').value.trim();

    if (!nome || !codigo) { 
        alert('⚠️ "Nome" e "Código" são obrigatórios!'); 
        return; 
    }

    // Objeto base com os dados do formulário
    const prod = { nome, peso, localizacao, codigo, entrada, validade, quantidade, imagem };

    try {
        // === CENÁRIO 1: EDIÇÃO ===
        if (editingIndex !== null) { 
            // O 'editingIndex' é o número da linha (0, 1, 2...).
            // Precisamos pegar o objeto real da lista para descobrir o ID do Banco (_id).
            const original = products[editingIndex];
            
            if (!original || !original._id) {
                console.error("❌ Erro: Produto original não encontrado ou sem ID.", editingIndex);
                alert("Erro interno: Produto não identificado.");
                return;
            }

            // Preenche o ID correto do MongoDB para a API saber quem atualizar
            prod._id = original._id; 
            prod.id = original._id;

            // Chama a API de atualização (PUT)
            const success = await syncProductToAPI(prod, false); 
            
            if(success) {
                addLogStructured('editar', `Editou produto "${prod.nome}"`, original.quantidade, prod.quantidade);
                closeAddModal();
            }
            return; 
        }

        // === CENÁRIO 2: VERIFICAÇÃO DE DUPLICIDADE (Novo Produto) ===
        const duplicado = products.find(p => 
            p.nome.toLowerCase() === nome.toLowerCase() && 
            p.codigo === codigo && 
            p.localizacao.toLowerCase() === localizacao.toLowerCase()
        );

        if (duplicado) {
            const desejaSomar = confirm(
                `⚠️ PRODUTO JÁ EXISTENTE!\n\n` +
                `Nome: ${duplicado.nome}\n` +
                `Local: ${duplicado.localizacao}\n` +
                `Qtd Atual: ${duplicado.quantidade}\n\n` +
                `Deseja SOMAR ${quantidade} unidades ao estoque existente?\n` +
                `[OK] = Somar\n` +
                `[Cancelar] = Criar novo lote separado`
            );

            if (desejaSomar) {
                const qtdAntes = duplicado.quantidade;
                duplicado.quantidade += quantidade;
                // Atualiza datas se informado
                if (validade) duplicado.validade = validade;
                if (entrada) duplicado.entrada = entrada;

                const success = await syncProductToAPI(duplicado, false);
                if (success) {
                    addLogStructured('merge', `Somou ${quantidade} un. em "${duplicado.nome}"`, qtdAntes, duplicado.quantidade);
                    closeAddModal();
                }
                return;
            }
        }

        // === CENÁRIO 3: SALVAR NOVO ===
        const success = await syncProductToAPI(prod, true); // true = POST
        if(success) {
            addLogStructured('novo', `Criou produto "${prod.nome}"`, null, prod.quantidade);
            closeAddModal();
        }

    } catch (erro) {
        console.error("Erro no Save:", erro);
        alert("Erro ao processar. Verifique o console.");
    }
}

function openDetails(index) {
    currentDetailProductIndex = index;
    const base = products[index];

    // Filtra localmente para mostrar similares
    const same = products
        .map((p, i) => ({ ...p, __idx: i }))
        .filter(p => p.nome === base.nome) // Filtra pelo nome para agrupar
        .sort((a, b) => {
            if (!a.validade) return 1;
            if (!b.validade) return -1;
            return new Date(a.validade) - new Date(b.validade);
        });

    const body = document.getElementById('modalDetailsBody');
    body.innerHTML = '';
    same.forEach(s => {
        // Precisamos achar o índice original dele na lista 'products' para os botões funcionarem
        const realIdx = products.findIndex(p => p._id === s._id);

        const el = document.createElement('div');
        el.className = 'detail-row';
        el.innerHTML = `
        <div style="flex:1">
          <div style="font-weight:800">${esc(s.nome)}</div>
          <div style="font-size:13px;color:var(--muted-text)">Local: ${esc(s.localizacao || '-')} • Código: ${esc(s.codigo || '-')}</div>
          <div style="font-size:13px;color:var(--muted-text)">Entrada: ${esc(s.entrada || '-')} • Validade: ${esc(s.validade || '-')}</div>
        </div>
        <div style="width:120px;text-align:center">
          <div style="font-weight:900;font-size:18px">${s.quantidade || 0}</div>
          <div style="display:flex;gap:6px;justify-content:center;margin-top:8px">
            <button class="btn btn-ghost" onclick="openAddModal(${realIdx})">Editar</button>
            <button class="btn btn-warn" onclick="openSell(${realIdx})">Vender</button>
          </div>
        </div>
      `;
        body.appendChild(el);
    });

    document.getElementById('modalDetails').style.display = 'flex';
}

function closeDetailsModal() {
    document.getElementById('modalDetails').style.display = 'none';
    currentDetailProductIndex = null;
}

function openSell(index) {
    sellingIndex = index;
    const p = products[index];
    document.getElementById('sellItemInfo').value = `${p.nome} • ${p.localizacao || '-'} • qtd: ${p.quantidade || 0}`;
    document.getElementById('sellQty').value = 1;
    document.getElementById('sellBuyer').value = '';
    document.getElementById('sellDoc').value = '';
    document.getElementById('modalSell').style.display = 'flex';
}

function closeSellModal() {
    document.getElementById('modalSell').style.display = 'none';
    sellingIndex = null;
}

async function confirmSell() {
    const qty = parseInt(document.getElementById('sellQty').value) || 0;
    const buyer = document.getElementById('sellBuyer').value.trim() || 'Consumidor';
    const doc = document.getElementById('sellDoc').value.trim() || '';

    if (sellingIndex === null) { alert('Erro: Produto não selecionado'); return; }

    const p = products[sellingIndex];
    if ((p.quantidade || 0) < qty) { alert('Quantidade insuficiente em estoque!'); return; }

    const before = p.quantidade || 0;
    p.quantidade = before - qty; // Atualiza localmente

    // Atualiza no Banco
    const success = await syncProductToAPI(p, false);

    if (success) {
        const sale = { 
            produto: p.nome, 
            quantidade: qty, 
            comprador: buyer, 
            doc, 
            ts: new Date().toISOString(), 
            productId: p._id,
            userId: currentUser 
        };

        // NOVO: POST para a rota de Vendas
        if (navigator.onLine) {
            try {
                await fetch('/api/vendas', {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify(sale)
                });
            } catch (e) {
                console.warn("API de Vendas falhou. Salvando log localmente.", e);
            }
        }
        
        // Salva Logs e Vendas localmente (cache)
        sales.unshift(sale);
        addLogStructured('venda', `Vendeu ${qty} de "${p.nome}" para ${buyer}`, before, p.quantidade, { saleId: sale.id });

        persistAll(); 
        updateAlertsAndSales();
        closeSellModal();
    }
}

// ============================================================
// 3. EXPORTAÇÕES (MANTIDAS INTEGRALMENTE)
// ============================================================

function exportCSV() {
    // Pega direto da variável products (que veio do banco)
    const rows = [['id', 'nome', 'peso', 'localizacao', 'codigo', 'entrada', 'validade', 'quantidade', 'imagem']];
    products.forEach(p => rows.push([p._id || '', p.nome || '', p.peso || '', p.localizacao || '', p.codigo || '', p.entrada || '', p.validade || '', p.quantidade || 0, p.imagem || '']));
    const csv = rows.map(r => r.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `vtz_produtos_${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
}

function exportJSON() {
    const data = JSON.stringify({ products, logs, sales }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `vtz_backup_${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
}

function exportPDF() {
    let html = `<html><head><title>Exportar PDF - VTZ</title><style>body{font-family:Arial,Helvetica,sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px;text-align:left}h2{color:#0b5e20}</style></head><body>`;
    html += `<h2>Estoque VTZ — ${new Date().toLocaleString()}</h2>`;
    html += `<table><thead><tr><th>Nome</th><th>Local</th><th>Código</th><th>Qtd</th><th>Validade</th></tr></thead><tbody>`;
    products.forEach(p => {
        html += `<tr><td>${esc(p.nome)}</td><td>${esc(p.localizacao || '')}</td><td>${esc(p.codigo || '')}</td><td>${p.quantidade || 0}</td><td>${esc(p.validade || '')}</td></tr>`;
    });
    html += `</tbody></table></body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.focus();
    // w.print(); // Descomente se quiser imprimir direto
}

function exportLogsPDF() {
    let html = `<html><head><title>Logs - VTZ</title><style>body{font-family:Arial;padding:20px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ccc;padding:8px;text-align:left;font-size:13px}th{background-color:#e8f5e9;color:#0b5e20}tr:nth-child(even){background-color:#fafafa}</style></head><body>`;
    html += `<h2>📜 Logs de Ações — ${new Date().toLocaleString()}</h2>`;
    html += `<table><thead><tr><th>Data</th><th>Usuário</th><th>Tipo</th><th>Mensagem</th><th>Detalhes</th></tr></thead><tbody>`;
    logs.forEach(l => {
        const beforeAfter = (l.before !== null || l.after !== null) ? `${l.before || ''} → ${l.after || ''}` : '';
        html += `<tr><td>${new Date(l.ts).toLocaleString()}</td><td>${l.user || '-'}</td><td>${l.type || '-'}</td><td>${l.message || '-'}</td><td>${beforeAfter}</td></tr>`;
    });
    html += `</tbody></table></body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.focus();
}

// ============================================================
// 4. IMPORTAÇÃO EXCEL E DOWNLOAD MODELO (MANTIDOS)
// ============================================================

function downloadExcelTemplate() {
    const wb = XLSX.utils.book_new();
    const wsData = [
        ["Nome", "Peso", "Localização", "Código", "Entrada", "Validade", "Quantidade", "Imagem"],
        ["Exemplo Produto", "10 KG", "N1", "123456", "2024-07-01", "2026-07-01", "50", "https://exemplo.com/imagem.jpg"]
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "Modelo");
    XLSX.writeFile(wb, "Modelo_Estoque_VTZ.xlsx");
}

let importPreview = [];

document.getElementById("excelInput").addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheet = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheet];
        const json = XLSX.utils.sheet_to_json(worksheet);

        if (json.length === 0) { alert("⚠️ Excel vazio."); return; }

        importPreview = json.map(row => {
            const novo = {
                nome: String(row.Nome || "").trim(),
                peso: String(row.Peso || "").trim(),
                localizacao: String(row.Localização || row.Local || "").trim(),
                codigo: String(row.Código || "").trim(),
                entrada: row.Entrada || "",
                validade: row.Validade || "",
                quantidade: parseInt(row.Quantidade) || 0,
                imagem: row.Imagem || ""
            };

            // Verifica duplicidade na lista que veio do MONGO
            const existente = products.find(p => p.nome === novo.nome && p.codigo === novo.codigo);

            return {
                ...novo,
                duplicado: !!existente,
                existenteId: existente ? existente._id : null,
                action: existente ? "none" : "new"
            };
        });

        renderImportModal();
    };
    reader.readAsArrayBuffer(file);
});

function renderImportModal() {
    const tbody = document.querySelector("#importTable tbody");
    tbody.innerHTML = "";
    importPreview.forEach((p, idx) => {
        const row = document.createElement("tr");
        row.style.background = p.duplicado ? "#fff8e1" : "#e8f5e9";

        let statusText = "✅ Novo";
        let btns = "-";

        if (p.duplicado) {
            statusText = "⚠️ Duplicado";
            const disabled = (act) => (p.action !== 'none' && p.action !== act) ? 'disabled' : '';

            btns = `
             <button class="btn btn-ghost" ${disabled('sum')} onclick="setImportAction(${idx},'sum')">${p.action === 'sum' ? '✅' : '➕ Somar'}</button>
             <button class="btn btn-ghost" ${disabled('replace')} onclick="setImportAction(${idx},'replace')">${p.action === 'replace' ? '✅' : '🔁 Substituir'}</button>
             <button class="btn btn-ghost" ${disabled('ignore')} onclick="setImportAction(${idx},'ignore')">${p.action === 'ignore' ? '✅' : '🚫 Ignorar'}</button>
            `;
        }

        row.innerHTML = `<td>${p.nome}</td><td>${p.peso}</td><td>${p.localizacao}</td><td>${p.codigo}</td><td>${p.validade}</td><td>${p.quantidade}</td><td>${statusText}</td><td>${btns}</td>`;
        tbody.appendChild(row);
    });
    document.getElementById("importModal").style.display = "flex";
}

function setImportAction(index, action) {
    importPreview[index].action = action;
    renderImportModal();
}

function closeImportModal() {
    if (confirm("Cancelar importação?")) {
        importPreview = [];
        document.getElementById("importModal").style.display = "none";
    }
}

async function confirmImportChanges() {
    // Esconde o modal
    document.getElementById("importModal").style.display = "none";
    updateStatusIndicator('sincronizando');

    let count = 0;
    console.log("🔄 Iniciando importação...");

    for (const item of importPreview) {
        try {
            showLoading()
            let sucesso = false;
            let msgLog = "";
            let tipoLog = "";

            // --- CASO 1: NOVO PRODUTO ---
            if (item.action === 'new') {
                const { action, duplicado, existenteId, ...data } = item;
                sucesso = await syncProductToAPI(data, true); // true = POST
                if (sucesso) {
                    tipoLog = "importacao";
                    msgLog = `Excel: Importou "${data.nome}" (Qtd: ${data.quantidade})`;
                }
            }

            // --- CASO 2: SOMAR ---
            else if (item.action === 'sum' && item.existenteId) {
                const target = products.find(p => p._id === item.existenteId);
                if (target) {
                    const qtdAntes = target.quantidade;
                    target.quantidade += item.quantidade;
                    sucesso = await syncProductToAPI(target, false); // false = PUT
                    if (sucesso) {
                        tipoLog = "merge_import";
                        msgLog = `Excel: Somou ${item.quantidade} un. em "${target.nome}"`;
                        // Adiciona log estruturado com antes/depois
                        addLogStructured(tipoLog, msgLog, qtdAntes, target.quantidade);
                        sucesso = false; // Já logamos acima, evita logar duplicado abaixo
                        count++;
                    }
                }
            }

            // --- CASO 3: SUBSTITUIR ---
            else if (item.action === 'replace' && item.existenteId) {
                const target = products.find(p => p._id === item.existenteId);
                if (target) {
                    target.quantidade = item.quantidade;
                    target.validade = item.validade;
                    sucesso = await syncProductToAPI(target, false);
                    if (sucesso) {
                        tipoLog = "replace_import";
                        msgLog = `Excel: Substituiu dados de "${target.nome}"`;
                    }
                }
            }

            // Se deu certo e temos mensagem (para os casos que não logaram dentro do if)
            if (sucesso && msgLog) {
                addLogStructured(tipoLog, msgLog, null, item.quantidade);
                count++;
            }

            hideLoading()
        } catch (err) {
            showLoading()
            console.error("Erro ao importar item:", item.nome, err);
            hideLoading()
        }
    }

    console.log("✅ Importação finalizada. Atualizando tela...");

    // 1. Recarrega produtos do banco
    await loadProductsFromAPI();

    // 2. FORÇA ATUALIZAR A LISTA DE LOGS VISUAL
    renderLogs();

    alert(`Processo finalizado! ${count} itens processados.`);
}

// ============================================================
// 5. FERRAMENTAS GERAIS (BUSCA, ETC)
// ============================================================

const fuseOptions = { keys: ['nome', 'codigo', 'localizacao', 'validade', 'peso'], threshold: 0.4 };

function handleSearch() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) { renderProductList(); return; }
    const fuse = new Fuse(products, fuseOptions);
    const results = fuse.search(query).map(r => r.item);

    // Hack de renderização filtrada
    const original = products;
    products = results;
    renderProductList();
    products = original;
}

function previewProductImage(url) {
    const img = document.getElementById("previewImg");
    if (url && url.startsWith("http")) { img.src = url; img.style.display = "block"; }
    else { img.style.display = "none"; }
}

// Validação
function validateFields() {
    let valid = true;
    ["field_nome", "field_peso", "field_local", "field_codigo"].forEach(id => {
        const el = document.getElementById(id);
        if (!el.value.trim()) { el.style.border = "2px solid red"; valid = false; }
        else el.style.border = "1px solid #ccc";
    });
    return valid;
}

// Status Dinâmico
function setupOnlineStatus() {
    // Listener que tenta sincronizar quando a internet volta
    window.addEventListener('online', async () => {
        await syncLoop(); // Tenta sincronizar a fila
        await loadProductsFromAPI(); // Carrega a lista fresca do banco
    });

    window.addEventListener('offline', () => updateStatusIndicator('offline'));

    // Força verificar agora
    updateStatusIndicator(navigator.onLine ? 'online' : 'offline');
}

function updateStatusIndicator(status) {
    const badge = document.getElementById('statusBadge');
    if (!badge) return;

    if (status === 'online') {
        badge.innerHTML = '🟢 Sistema Online';
        badge.style.background = 'var(--green-2)';
    } else if (status === 'offline') {
        badge.innerHTML = '🔴 Sem Internet';
        badge.style.background = 'var(--danger)';
    } else {
        badge.innerHTML = '🟡 Sincronizando...';
        badge.style.background = 'var(--warn)';
    }
}

// ============================================================
// 5. REGISTRO DE USUÁRIOS (ADMIN-ONLY)
// ============================================================

function openRegisterModal() {
    document.getElementById('modalRegister').style.display = 'flex';
    document.getElementById('adminNomeHeader').innerText = currentUser;
    document.getElementById('registerMessage').innerText = '';

    // Limpa campos
    document.getElementById('reg_nome').value = '';
    document.getElementById('reg_email').value = '';
    document.getElementById('reg_senha').value = '';
    document.getElementById('reg_cargo').value = 'funcionario';
}

function closeRegisterModal() {
    document.getElementById('modalRegister').style.display = 'none';
}

async function registerUser() {
    const nome = document.getElementById('reg_nome').value.trim();
    const email = document.getElementById('reg_email').value.trim();
    const senha = document.getElementById('reg_senha').value;
    const cargo = document.getElementById('reg_cargo').value;
    const msgEl = document.getElementById('registerMessage');

    if (!nome || !email || !senha) {
        msgEl.innerText = "Preencha Nome, E-mail e Senha.";
        return;
    }
    if (senha.length < 4) {
        msgEl.innerText = "A senha deve ter pelo menos 4 caracteres.";
        return;
    }

    msgEl.innerText = 'Criando conta...';

    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: getAuthHeaders(), // Envia o Token do Admin
            body: JSON.stringify({ nome, email, senha, cargo })
        });

        const dados = await res.json();

        if (res.ok) {
            msgEl.style.color = 'var(--green)';
            msgEl.innerText = `✅ Sucesso! ${nome} (${cargo.toUpperCase()}) foi cadastrado.`;
            addLogStructured('user_new', `Admin ${currentUser} criou a conta de ${nome} (${cargo})`);

            // Limpa o formulário após 2 segundos
            setTimeout(() => { closeRegisterModal(); }, 2000);

        } else if (res.status === 403) {
            msgEl.style.color = 'var(--danger)';
            msgEl.innerText = '❌ FALHA: ' + dados.msg; // Exibe o erro de Limite de 5 Admins
        } else {
            msgEl.style.color = 'var(--danger)';
            msgEl.innerText = '❌ Erro ao cadastrar: ' + (dados.msg || 'Falha no servidor');
        }

    } catch (e) {
        msgEl.style.color = 'var(--danger)';
        msgEl.innerText = '❌ Erro de conexão com a API.';
    }
}
function closeAdminPanelModal() {
    document.getElementById('modalAdminPanel').style.display = 'none';
}

async function openAdminPanelModal() {
    document.getElementById('modalAdminPanel').style.display = 'flex';
    await fetchUsers(); // Carrega a lista ao abrir
}

async function fetchUsers() {
    showLoading(); 
    try {
        const response = await fetch('/api/users', { headers: getAuthHeaders() });
        
        if (response.status === 403) {
            alert('Acesso negado. Apenas Admins podem listar usuários.');
            document.getElementById('modalAdminPanel').style.display = 'none';
            return;
        }

        const users = await response.json();
        renderUserTable(users);

    } catch (e) {
        console.error('Erro ao buscar usuários:', e);
        alert('Erro ao carregar lista de usuários. Verifique o servidor.');
        renderUserTable(null); // Renderiza a tabela vazia
    } finally {
         
    }
    hideLoading();
}

function renderUserTable(users) {
    const tbody = document.querySelector('#userTable tbody');
    tbody.innerHTML = '';

    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4">Nenhum usuário encontrado.</td></tr>';
        return;
    }

    users.forEach(user => {
        const row = document.createElement('tr');
        // Checa se o usuário atual logado não pode deletar/editar a própria conta
        const isSelf = user.email === currentUser; 
        
        row.innerHTML = `
            <td>${user.nome}</td>
            <td>${user.email}</td>
            <td><strong>${user.cargo.toUpperCase()}</strong></td>
            <td>
                <button class="btn btn-ghost" onclick="openUserEditModal('${user._id}', '${user.cargo}', '${user.email}')" title="Modificar Senha/Cargo" ${isSelf ? 'disabled' : ''}>
                    Editar
                </button>
                <button class="btn btn-warn" onclick="deleteUser('${user._id}', '${user.nome}')" title="Remover Usuário" ${isSelf ? 'disabled' : ''}>
                    Excluir
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Local: Adicionar no final do arquivo JS

// --- FUNÇÃO DE DELETAR ---
async function deleteUser(id, nome) {
    if (confirm(`ATENÇÃO: Deseja remover permanentemente a conta de "${nome}"? Esta ação não pode ser desfeita.`)) {
        showLoading();
        try {
            const response = await fetch(`/api/users/${id}`, {
                method: 'DELETE',
                headers: getAuthHeaders() // Envia o Token do Admin
            });

            if (response.status === 403) {
                 alert("❌ Falha: Não é permitido deletar o usuário logado.");
            } else if (!response.ok) {
                 throw new Error('Falha ao deletar no servidor.');
            }

            addLogStructured('user_delete', `Admin ${currentUser} removeu a conta de ${nome}`);
            await fetchUsers(); // Recarrega a tabela
        } catch (e) {
            console.error('Erro ao deletar usuário:', e);
            alert('Erro ao processar exclusão. Tente novamente.');
        } finally {
            hideLoading();
        }
    }
}

// --- FUNÇÃO DE EDIÇÃO ---
function openUserEditModal(id, currentRole, email) {
    // Para simplificar o fluxo, usaremos um PROMPT para a nova senha
    // e um prompt para a nova função.
    
    // 1. EDITAR CARGO
    const newRole = prompt(`Editar cargo para ${email}:\nDigite 'admin' ou 'funcionario':`, currentRole);
    if (!newRole || (newRole !== 'admin' && newRole !== 'funcionario')) {
        if (newRole) alert('Cargo inválido. Use "admin" ou "funcionario".');
        return;
    }

    // 2. EDITAR SENHA
    const newPassword = prompt(`Modificar senha para ${email}:\nDeixe em branco para manter a senha atual.`);

    updateUser(id, newRole, newPassword, email);
}

// --- FUNÇÃO QUE CHAMA A API PUT (UPDATE) ---
async function updateUser(id, cargo, novaSenha, email) {
    showLoading();
    try {
        const body = { cargo: cargo };
        if (novaSenha) {
            body.novaSenha = novaSenha;
        }

        const response = await fetch(`/api/users/${id}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(body)
        });

        const dados = await response.json();

        if (response.status === 403) {
            alert('❌ Falha: ' + dados.msg); // Bloqueio por tentar se rebaixar ou limite de 5 admins
        } else if (!response.ok) {
            throw new Error('Falha ao atualizar no servidor.');
        }

        addLogStructured('user_update', `Admin ${currentUser} atualizou a conta de ${email}. Novo cargo: ${cargo}`);
        await fetchUsers();
        alert(`✅ Sucesso! Conta de ${email} atualizada para ${cargo}.`);

    } catch (e) {
        console.error('Erro ao atualizar usuário:', e);
        alert('Erro ao atualizar. Verifique sua conexão e tente novamente.');
    } finally {
        hideLoading();
    }
}

// Exposição Global
window.logout = () => { localStorage.removeItem('loggedUser'); window.location.href = "/Login.html"; };
window.onSearch = handleSearch;
window.openAddModal = openAddModal;
window.closeAddModal = closeAddModal;
window.saveProduct = saveProduct;
window.removeProduct = removeProduct;
window.openDetails = openDetails;
window.closeDetailsModal = closeDetailsModal;
window.openSell = openSell;
window.closeSellModal = closeSellModal;
window.confirmSell = confirmSell;
window.previewProductImage = previewProductImage;
window.executarAcao = (val) => {
    if (val === 'exportCSV') exportCSV();
    if (val === 'exportJSON') exportJSON();
    if (val === 'exportPDF') exportPDF();
    if (val === 'exportLogsPDF') exportLogsPDF();
    if (val === 'abrirImportacao') document.getElementById("excelInput").click();
    if (val === 'baixarModelo') downloadExcelTemplate();
    document.getElementById("acoesSelect").value = "";
};
window.closeImportModal = closeImportModal;
window.confirmImportChanges = confirmImportChanges;
window.setImportAction = setImportAction;
window.openAdminPanelModal = openAdminPanelModal;
window.closeAdminPanelModal = closeAdminPanelModal;