const express = require('express');
const router = express.Router();
const Venda = require('../models/Venda');
const { validarToken } = require('../middleware/authMiddleware');

// ROTA: Registrar Nova Venda (POST /api/vendas)
router.post('/', validarToken, async (req, res) => {
    try {
        console.log("📥 Recebendo venda:", req.body); // Mostra o que chegou

        // Criação direta sem validações extras do Mongoose por enquanto
        const novaVenda = new Venda({
            produto: req.body.produto,
            quantidade: req.body.quantidade,
            comprador: req.body.comprador,
            doc: req.body.doc,
            ts: new Date(),
            // Força conversão para String para evitar erro de ObjectId
            productId: String(req.body.productId || ''), 
            userId: String(req.body.userId || 'Anonimo')
        });

        const vendaSalva = await novaVenda.save();
        console.log("✅ Venda salva com ID:", vendaSalva._id);
        res.status(201).json(vendaSalva);

    } catch (erro) {
        console.error("❌ ERRO FATAL NA VENDA:", erro); // Isso vai aparecer no seu terminal
        res.status(500).json({ 
            msg: 'Erro ao registrar venda', 
            erro: erro.message // Manda o detalhe para o navegador
        });
    }
});

// ROTA: Listar Vendas (GET)
router.get('/', validarToken, async (req, res) => {
    try {
        const vendas = await Venda.find().sort({ ts: -1 }).limit(50);
        res.json(vendas);
    } catch (erro) {
        res.status(500).json({ msg: 'Erro ao buscar vendas' });
    }
});

module.exports = router;