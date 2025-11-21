const mongoose = require('mongoose');

const VendaSchema = new mongoose.Schema({
    produto: { type: String, required: true },
    quantidade: { type: Number, required: true },
    comprador: { type: String, default: 'Consumidor Final' },
    doc: { type: String }, // CPF/CNPJ
    ts: { type: Date, default: Date.now }, // Timestamp
    // Referência ao produto (opcionalmente)
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Produto' },
    
    // Quem realizou a venda (opcionalmente)
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' }
});

module.exports = mongoose.model('Venda', VendaSchema);