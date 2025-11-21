// Sistema de Login Integrado com API
const form = document.getElementById('loginForm'); // Pega o formulário (adicionei id no HTML se não tiver, verifique abaixo)
const btnLogin = document.getElementById('btnLogin');

btnLogin.addEventListener('click', async (e) => {
    e.preventDefault(); // Não recarrega a página

    const email = document.getElementById('loginUser').value.trim(); // Assumindo que você usou esse ID para o email
    const senha = document.getElementById('loginPass').value.trim();
    const inputCaptcha = document.getElementById('captchaInput').value.toUpperCase().trim();

    if (!email || !senha) {
        alert("Por favor, preencha todos os campos.");
        return;
    }

    if (inputCaptcha !== captchaCode) {
        alert("❌ Captcha incorreto! Tente novamente.");
        generateCaptcha(); // Gera um novo para evitar brute-force
        document.getElementById('captchaInput').value = '';
        return; // PARA AQUI
    }

    // Muda o botão para "Carregando..."
    const textoOriginal = btnLogin.innerText;
    btnLogin.innerText = "Verificando...";
    btnLogin.disabled = true;

    try {
        // Manda os dados para o nosso servidor Node.js
        const resposta = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, senha })
        });

        const dados = await resposta.json();

        if (resposta.ok) {
            // LOGIN SUCESSO!
            // salvamos o TOKEN e o CARGO que o servidor devolveu!
            localStorage.setItem('vtzToken', dados.token); // SALVA O TOKEN
            localStorage.setItem('loggedUser', dados.usuario.email);
            localStorage.setItem('userRole', dados.usuario.cargo); 

            if (dados.mustChangePassword === true) {
                alert("🔒 Primeiro acesso detectado!\nVocê precisa definir sua senha pessoal agora.");
                window.location.href = "/resetPassword.html?mode=first_login";
                return; // Para tudo e redireciona
            }

            console.log("Login aprovado. Token gerado:", dados.token.slice(0, 15) + '...');
            window.location.href = "/sistemaEstoque.html"; 
        } else {
            // ERRO (Senha errada ou usuário não existe)
            alert("Erro: " + dados.msg);
        }

    } catch (erro) {
        console.error("Erro de conexão:", erro);
        alert("Erro ao conectar com o servidor. Verifique se ele está rodando.");
    } finally {
        // Restaura o botão
        btnLogin.innerText = textoOriginal;
        btnLogin.disabled = false;
    }
});
// ============================================================
// LÓGICA DE RECUPERAÇÃO DE SENHA
// ============================================================

function openForgotPasswordModal(event) {
    event.preventDefault(); // Impede o link de recarregar a página
    document.getElementById('forgotPasswordModal').style.display = 'flex';
    document.getElementById('resetMessage').innerText = '';
}

function closeForgotPasswordModal() {
    document.getElementById('forgotPasswordModal').style.display = 'none';
}

async function submitForgotPassword() {
    const email = document.getElementById('resetEmail').value.trim();
    const btnReset = document.getElementById('btnReset');
    const msgEl = document.getElementById('resetMessage');

    if (!email) {
        msgEl.innerText = "Digite um e-mail válido.";
        return;
    }
    
    // Desabilita o botão para evitar cliques duplos
    btnReset.disabled = true;
    btnReset.innerText = 'Enviando...';
    msgEl.innerText = 'Verificando e enviando...';

    try {
        const response = await fetch('/api/auth/forgotPassword', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        const dados = await response.json();

        // O servidor sempre retorna 200/OK por questões de segurança, 
        // para não revelar quais e-mails estão cadastrados.
        msgEl.style.color = '#10B981'; // Cor verde de sucesso
        msgEl.innerText = '✅ ' + dados.msg; 
        
        // Mantém a mensagem por alguns segundos
        setTimeout(() => { closeForgotPasswordModal(); }, 4000); 

    } catch (error) {
        msgEl.style.color = '#EF4444'; // Cor vermelha de erro
        msgEl.innerText = '❌ Erro de conexão. Verifique o servidor.';
        console.error(error);
    } finally {
        btnReset.disabled = false;
        btnReset.innerText = 'Enviar Link';
    }
}
// ============================================
// LÓGICA DE CAPTCHA
// ============================================
let captchaCode = '';

function generateCaptcha() {
    const canvas = document.getElementById('captchaCanvas');
    const ctx = canvas.getContext('2d');
    
    // Limpa
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f3f3f3';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Gera código aleatório
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    captchaCode = code;

    // Adiciona ruído (linhas)
    for (let i = 0; i < 7; i++) {
        ctx.strokeStyle = `rgba(0,0,0,${Math.random() * 0.3})`;
        ctx.beginPath();
        ctx.moveTo(Math.random() * canvas.width, Math.random() * canvas.height);
        ctx.lineTo(Math.random() * canvas.width, Math.random() * canvas.height);
        ctx.stroke();
    }

    // Desenha texto
    ctx.font = 'bold 24px Courier New';
    ctx.fillStyle = '#333';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    
    // Leve rotação e espaçamento
    let x = 20;
    for (let i = 0; i < code.length; i++) {
        ctx.save();
        ctx.translate(x, 20);
        ctx.rotate((Math.random() - 0.5) * 0.4);
        ctx.fillText(code[i], 0, 0);
        ctx.restore();
        x += 20;
    }
}

// Inicia o Captcha ao carregar
document.addEventListener('DOMContentLoaded', () => {
    generateCaptcha();
});