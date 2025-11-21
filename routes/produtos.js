const express = require('express');
const router = express.Router();
const Produto = require('../models/Produto'); // Pega o molde do produto
const { validarToken, isAdmin } = require('../middleware/authMiddleware'); // Importa o middleware

// 1. LISTAR TODOS (GET /api/produtos)
router.get('/', validarToken, async (req, res) => {
    try {
        // Busca tudo no banco e ordena por nome
        const produtos = await Produto.find().sort({ nome: 1 });
        res.json(produtos);
    } catch (erro) {
        res.status(500).json({ msg: 'Erro ao buscar produtos' });
    }
});

// 2. ADICIONAR NOVO (POST /api/produtos)
router.post('/', validarToken, async (req, res) => {
    const { nome, peso, localizacao, codigo, entrada, validade, quantidade, imagem } = req.body;

    try {
        // Cria o novo produto usando o Molde
        const novoProduto = new Produto({
            nome, peso, localizacao, codigo, entrada, validade, quantidade, imagem
        });

        const produtoSalvo = await novoProduto.save();
        res.json(produtoSalvo); // Devolve o produto criado para o site
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ msg: 'Erro ao salvar produto' });
    }
});

// 3. EDITAR / ATUALIZAR ESTOQUE (PUT /api/produtos/:id)
router.put('/:id', validarToken, async (req, res) => {
    try {
        // Encontra pelo ID e atualiza com os dados novos
        // { new: true } serve para retornar o produto já atualizado
        const produtoAtualizado = await Produto.findByIdAndUpdate(
            req.params.id, 
            req.body, 
            { new: true } 
        );
        
        if (!produtoAtualizado) {
            return res.status(404).json({ msg: 'Produto não encontrado' });
        }

        res.json(produtoAtualizado);
    } catch (erro) {
        res.status(500).json({ msg: 'Erro ao atualizar produto' });
    }
});

// 4. DELETAR (DELETE /api/produtos/:id)
router.delete('/:id', validarToken, isAdmin, async (req, res) => { 
    try {
        const produtoRemovido = await Produto.findByIdAndDelete(req.params.id);
        
        if (!produtoRemovido) {
            return res.status(404).json({ msg: 'Produto não encontrado' });
        }

        res.json({ msg: 'Produto removido com sucesso!' });
    } catch (erro) {
        res.status(500).json({ msg: 'Erro ao deletar produto' });
    }
});

module.exports = router;