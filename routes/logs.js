
const express = require('express');
const router = express.Router();
const Log = require('../models/Log');
const { validarToken, isAdmin } = require('../middleware/authMiddleware'); 

// ROTA: Listar Logs
router.get('/', validarToken, async (req, res) => {
    try {
        // Logs são importantes, listamos os 200 mais recentes
        const logs = await Log.find().sort({ ts: -1 }).limit(200); 
        res.json(logs);
    } catch (erro) {
        res.status(500).json({ msg: 'Erro ao buscar logs' });
    }
});

// ROTA: Registrar Novo Log (POST /api/logs)
// Apenas Admins ou Funcionários logados podem registrar logs
router.post('/', validarToken, async (req, res) => { 
    try {
        const novoLog = new Log(req.body);
        const logSalvo = await novoLog.save();
        res.status(201).json(logSalvo);
    } catch (erro) {
        res.status(500).json({ msg: 'Erro ao registrar log' });
    }
});

module.exports = router;