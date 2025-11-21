const mongoose = require('mongoose');

const UsuarioSchema = new mongoose.Schema({
    nome: { 
        type: String, 
        required: true 
    },
    email: { 
        type: String, 
        required: true, 
        unique: true // Não deixa cadastrar 2 emails iguais
    },
    senha: { 
        type: String, 
        required: true 
    },
    cargo: { 
        type: String, 
        enum: ['admin', 'funcionario'], // Só aceita esses dois tipos
        default: 'funcionario' 
    },

    mustChangePassword: { 
        type: Boolean, 
        default: false 
    },

    criadoEm: { 
        type: Date, 
        default: Date.now 
    }

});


module.exports = mongoose.model('Usuario', UsuarioSchema);