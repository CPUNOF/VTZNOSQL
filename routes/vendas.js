
const express = require('express');
const router = express.Router();
const Venda = require('../models/Venda');
const { validarToken } = require('../middleware/authMiddleware'); // Para segurança

// ROTA: Listar Vendas (Futuramente)
router.get('/', validarToken, async (req, res) => {
    try {
        const vendas = await Venda.find().sort({ ts: -1 }).limit(100); // Últimas 100
        res.json(vendas);
    } catch (erro) {
        res.status(500).json({ msg: 'Erro ao buscar histórico de vendas' });
    }
});

// ROTA: Registrar Nova Venda (POST /api/vendas)
router.post('/', validarToken, async (req, res) => {
    try {
        const novaVenda = new Venda(req.body);
        const vendaSalva = await novaVenda.save();
        res.status(201).json(vendaSalva);
    } catch (erro) {
        res.status(500).json({ msg: 'Erro ao registrar venda' });
    }
});

module.exports = router;