const mongoose = require('mongoose');

const ProdutoSchema = new mongoose.Schema({
    nome: { type: String, required: true }, // Obrigatório
    peso: { type: String },                 // Ex: "10 KG"
    localizacao: { type: String },          // Ex: "N1"
    codigo: { type: String, required: true }, // SKU (Obrigatório)
    
    // Datas
    entrada: { type: String },  // Data que chegou
    validade: { type: String, required: false }, // OPCIONAL (Para ferro, arame, etc)
    
    quantidade: { type: Number, default: 0 }, // Começa com 0 se não informar
    imagem: { type: String } // URL da foto
});

module.exports = mongoose.model('Produto', ProdutoSchema);