const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Usuario = require('../models/Usuario'); // Pega o molde do usuário
const { validarToken, isAdmin } = require('../middleware/authMiddleware');
const { sendEmail } = require('../utils/emailService');

require('dotenv').config();
// ROTA: Cadastrar novo usuário (POST /api/auth/register)
router.post('/register', validarToken, isAdmin, async (req, res) => {
    const { nome, email, senha, cargo } = req.body;

    try {
        // 1. Verificar se o usuário já existe
        let usuarioExistente = await Usuario.findOne({ email });
        if (usuarioExistente) {
            return res.status(400).json({ msg: 'Este e-mail já está cadastrado.' });
        }

        // 2. REGRA DE OURO: Limite de 5 Admins
        if (cargo === 'admin') {
            const totalAdmins = await Usuario.countDocuments({ cargo: 'admin' });
            if (totalAdmins >= 5) {
                return res.status(403).json({ msg: 'Limite de segurança atingido: Máximo de 5 Administradores permitidos.' });
            }
        }

        // 3. Criptografar a senha
        const salt = await bcrypt.genSalt(10);
        const senhaCriptografada = await bcrypt.hash(senha, salt);

        // 4. Criar o novo usuário
        const novoUsuario = new Usuario({
            nome,
            email,
            senha: senhaCriptografada,
            cargo: cargo || 'funcionario',
            mustChangePassword: true
        });

        // 5. Salvar no Banco
        await novoUsuario.save();

        // === 6. ENVIAR E-MAIL DE BOAS-VINDAS ===
        try {
            const loginLink = `https://vtznosql.onrender.com/Login.html`;
            
            const subject = 'Bem-vindo à VTZ Agronegócios - Acesso Criado';
            const html = `
                <div style="font-family: Arial, sans-serif; color: #333;">
                    <h2 style="color: #3fbb3b;">Olá, ${nome}!</h2>
                    <p>Sua conta foi criada com sucesso pelo Administrador.</p>
                    <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; border: 1px solid #eee;">
                        <p><strong>Login:</strong> ${email}</p>
                        <p><strong>Senha Temporária:</strong> ${senha}</p>
                        <p><strong>Cargo:</strong> ${cargo || 'funcionario'}</p>
                    </div>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                    <p>Recomendamos que você altere sua senha imediatamente acessando o sistema.</p>
                    <p style="text-align: center;">
                        <a href="${loginLink}" style="display: inline-block; padding: 12px 24px; background: #3fbb3b; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">ACESSAR SISTEMA</a>
                    </p>
                </div>
            `;
            
            // Envia o e-mail (Não bloqueia o sucesso se falhar, apenas avisa no console)
            await sendEmail(email, subject, 'Sua conta foi criada.', html);
            console.log(`📧 E-mail de boas-vindas enviado para ${email}`);

        } catch (emailErr) {
            console.error("⚠️ Erro ao enviar e-mail de cadastro (mas o usuário foi criado):", emailErr);
        }

        res.status(201).json({ msg: 'Usuário cadastrado e e-mail enviado com sucesso!', id: novoUsuario._id });

    } catch (error) {
        console.error(error);
        res.status(500).json({ msg: 'Erro no servidor ao cadastrar.' });
    }
});

// ROTA: Login (POST /api/auth/login)
router.post('/login', async (req, res) => {
    const { email, senha } = req.body;
    
    // Validação Crítica para strings válidas
    if (!email || !senha || typeof email !== 'string' || typeof senha !== 'string' || email.trim() === '') {
        return res.status(400).json({ msg: 'E-mail e senha devem ser fornecidos.' });
    }

    try {
        // 1. Achar o usuário pelo email
        const usuario = await Usuario.findOne({ email });
        if (!usuario) {
            return res.status(400).json({ msg: 'Usuário não encontrado.' });
        }
        
        // 2. Verificar se a senha bate (compara a senha digitada com o hash)
        const senhaCorreta = await bcrypt.compare(senha, usuario.senha);
        if (!senhaCorreta) {
            return res.status(400).json({ msg: 'Senha incorreta.' });
        }

        // 3. Login aceito! Gerar Token JWT
        const token = jwt.sign(
            { id: usuario._id, cargo: usuario.cargo }, // O que o token irá carregar
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        // 4. Retorna o Token e as informações do usuário
        res.json({
            msg: 'Login realizado!',
            token: token, // O TOKEN É A NOVA CHAVE DE ACESSO
            usuario: {
                id: usuario._id,
                nome: usuario.nome,
                email: usuario.email,
                cargo: usuario.cargo
            },
            mustChangePassword: usuario.mustChangePassword
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ msg: 'Erro no login.' });
    }
});

// ROTA: Esqueci a Senha (POST /api/auth/forgotPassword)
router.post('/forgotPassword', async (req, res) => {
    const { email } = req.body;

    try {
        // 1. Verificar se o usuário existe
        const usuario = await Usuario.findOne({ email });
        if (!usuario) {
            // É uma boa prática de segurança não dizer se o email existe ou não
            return res.status(400).json({ msg: 'Se o usuário estiver registrado, você receberá um link de recuperação.' });
        }

        // 2. Gerar Token de Recuperação (Válido por apenas 15 minutos)
        const resetToken = jwt.sign(
            { id: usuario._id },
            process.env.JWT_SECRET,
            { expiresIn: '15m' } // Token expira em 15 minutos
        );

        // 3. Montar o link de recuperação 
        // Por enquanto, mostraremos o link no console para o teste.
        const resetLink = `http://localhost:3000/reset-password?token=${resetToken}&id=${usuario._id}`;

        // 4. Enviar o E-mail
        const subject = 'VTZ Agronegócios - Recuperação de Senha';
        const htmlContent = `
            <p>Olá, ${usuario.nome},</p>
            <p>Você solicitou a recuperação de sua senha. Use o link abaixo para criar uma nova:</p>
            <p><a href="${resetLink}">CLIQUE AQUI PARA RESETAR SUA SENHA</a></p>
            <p>Este link expira em 15 minutos. Se você não solicitou isso, ignore este e-mail.</p>
        `;

        const emailSuccess = await sendEmail(usuario.email, subject, 'Link de recuperação: ' + resetLink, htmlContent);

        if (emailSuccess) {
            return res.status(200).json({ msg: 'Se o usuário estiver registrado, você receberá um link de recuperação.' });
        } else {
            return res.status(500).json({ msg: 'Erro ao enviar o e-mail de recuperação.' });
        }

    } catch (error) {
        console.error('ERRO EM FORGOT PASSWORD:', error);
        res.status(500).json({ msg: 'Erro no servidor durante a recuperação de senha.' });
    }
});

// ROTA: Redefinir Senha (POST /api/auth/resetPassword)
router.post('/resetPassword', async (req, res) => {
    const { token, userId, newPassword } = req.body;

    try {
        // 1. Verificar o Token e a validade (usamos try/catch para erros de expiração)
        const decodificado = jwt.verify(token, process.env.JWT_SECRET);
        
        // 2. Verificar se o Token pertence ao usuário certo
        if (decodificado.id !== userId) {
            return res.status(400).json({ msg: 'Token inválido para este usuário.' });
        }

        // 3. Achar o usuário e criptografar a nova senha
        const usuario = await Usuario.findById(userId);
        if (!usuario) {
            return res.status(404).json({ msg: 'Usuário não encontrado.' });
        }

        const salt = await bcrypt.genSalt(10);
        const senhaHash = await bcrypt.hash(newPassword, salt);

        // 4. Salvar a nova senha
        usuario.senha = senhaHash;
        await usuario.save();

        res.status(200).json({ msg: 'Senha atualizada com sucesso!' });

    } catch (error) {
        console.error('ERRO EM RESET PASSWORD:', error);
        if (error.name === 'TokenExpiredError') {
            return res.status(400).json({ msg: 'O link de recuperação expirou (máximo 15 minutos).' });
        }
        res.status(500).json({ msg: 'Erro no servidor. Tente novamente.' });
    }
});

router.post('/forcePasswordChange', validarToken, async (req, res) => {
    const { newPassword } = req.body;
    const userId = req.usuario.id; // Pega do Token

    try {
        const usuario = await Usuario.findById(userId);
        if (!usuario) return res.status(404).json({ msg: 'Usuário não encontrado.' });

        // Criptografa nova senha
        const salt = await bcrypt.genSalt(10);
        usuario.senha = await bcrypt.hash(newPassword, salt);
        
        // Desativa a obrigação de troca
        usuario.mustChangePassword = false;
        
        await usuario.save();
        res.json({ msg: 'Senha atualizada com sucesso! Acesso liberado.' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ msg: 'Erro ao atualizar senha.' });
    }
});


module.exports = router;