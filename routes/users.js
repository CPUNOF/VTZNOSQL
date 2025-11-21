// Arquivo: routes/users.js
const express = require('express');
const router = express.Router();
const Usuario = require('../models/Usuario');
const { validarToken, isAdmin } = require('../middleware/authMiddleware');
const bcrypt = require('bcryptjs');

// Middleware para todas as rotas deste arquivo: APENAS ADMIN PODE ACESSAR!
// Garantimos que o token é válido e o cargo é 'admin'
router.use(validarToken, isAdmin); // <--- BLINDA TODAS AS ROTAS ABAIXO

// 1. LISTAR TODOS OS USUÁRIOS (GET /api/users)
router.get('/', async (req, res) => {
    try {
        // Seleciona todos os usuários, mas omite o campo 'senha' por segurança
        const usuarios = await Usuario.find().select('-senha').sort({ cargo: -1, nome: 1 });
        res.json(usuarios);
    } catch (erro) {
        res.status(500).json({ msg: 'Erro ao listar usuários.' });
    }
});

// 2. DELETAR UM USUÁRIO (DELETE /api/users/:id)
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verifica se o usuário Admin está tentando deletar a própria conta
        if (req.usuario.id === id) {
             return res.status(403).json({ msg: 'Não é possível deletar a conta que está logada no momento.' });
        }

        const usuarioRemovido = await Usuario.findByIdAndDelete(id);
        
        if (!usuarioRemovido) {
            return res.status(404).json({ msg: 'Usuário não encontrado.' });
        }
        
        res.json({ msg: 'Usuário removido com sucesso!' });
    } catch (erro) {
        res.status(500).json({ msg: 'Erro ao deletar usuário.' });
    }
});

// 3. ATUALIZAR CARGO OU SENHA (PUT /api/users/:id)
router.put('/:id', async (req, res) => {
    const { nome, cargo, novaSenha } = req.body;
    const { id } = req.params;
    let updateFields = { nome, cargo };

    try {
        // Se uma nova senha foi fornecida, criptografa e adiciona aos campos de update
        if (novaSenha) {
            const salt = await bcrypt.genSalt(10);
            updateFields.senha = await bcrypt.hash(novaSenha, salt);
        }
        
        // Regra de segurança: Checar se o Admin está tentando se rebaixar
        if (req.usuario.id === id && cargo === 'funcionario') {
             return res.status(403).json({ msg: 'Não é permitido se rebaixar de cargo. Use outra conta Admin.' });
        }

        // Regra de segurança: Limite de Admins (se estiver promovendo)
        if (cargo === 'admin') {
            const totalAdmins = await Usuario.countDocuments({ cargo: 'admin' });
            // Se já tem 5 Admins e o usuário que está sendo editado NÃO é um deles, bloqueia.
            if (totalAdmins >= 5) {
                const usuario = await Usuario.findById(id);
                if (usuario.cargo !== 'admin') {
                    return res.status(403).json({ msg: 'Limite de 5 Admins atingido. Não é possível promover mais usuários.' });
                }
            }
        }

        const usuarioAtualizado = await Usuario.findByIdAndUpdate(id, updateFields, { new: true, runValidators: true }).select('-senha');
        
        if (!usuarioAtualizado) {
            return res.status(404).json({ msg: 'Usuário não encontrado.' });
        }

        res.json({ msg: 'Usuário atualizado!', usuario: usuarioAtualizado });
    } catch (erro) {
        res.status(500).json({ msg: 'Erro ao atualizar usuário.' });
    }
});

module.exports = router;