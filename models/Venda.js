const mongoose = require('mongoose');

const VendaSchema = new mongoose.Schema({
    produto: { type: String, required: true },
    quantidade: { type: Number, required: true },
    comprador: { type: String, default: 'Consumidor Final' },
    doc: { type: String },
    ts: { type: Date, default: Date.now },
    productId: { type: String }, 
    userId: { type: String }
});

module.exports = mongoose.model('Venda', VendaSchema);