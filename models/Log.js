
const mongoose = require('mongoose');

const LogSchema = new mongoose.Schema({
    ts: { type: Date, default: Date.now },
    user: { type: String, required: true }, // Quem fez
    type: { type: String, required: true }, // Tipo de ação (venda, editar, remover, importacao)
    message: { type: String, required: true }, // Mensagem principal
    before: { type: mongoose.Schema.Types.Mixed }, // Valor antes (qtd, nome, etc.)
    after: { type: mongoose.Schema.Types.Mixed }, // Valor depois
    meta: { type: mongoose.Schema.Types.Mixed } // Dados extras
});

module.exports = mongoose.model('Log', LogSchema);