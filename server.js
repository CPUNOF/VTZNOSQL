const express = require('express');
const path = require('path');
const connectDB = require('./db'); // Importa o arquivo db.js que criamos
require('dotenv').config(); // Carrega as variáveis do .env

const app = express();
const PORT = process.env.PORT || 3000;

// CONECTANDO AO MONGODB 
connectDB(); 

// Configurações do Servidor
app.use(express.json()); // Permite ler dados JSON 
app.use(express.static(path.join(__dirname, 'public'))); // Pasta dos arquivos do site

// Rota Principal (Página Inicial)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// Rota para a página de Redefinição de Senha
app.get('/reset-password', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'resetPassword.html'));
});
//ROTAS DA API
app.use('/api/auth', require('./routes/auth'));// Login e Cadastro
app.use('/api/produtos', require('./routes/produtos')); // Rota de Produtos

//Rotas de Vendas e Logs
app.use('/api/vendas', require('./routes/vendas')); 
app.use('/api/logs', require('./routes/logs'));    

app.use('/api/users', require('./routes/users'));

// Pasta Pública (Frontend)
app.use(express.static(path.join(__dirname, 'public')));

// Ligando o Servidor
app.listen(PORT, () => {
    console.log(`📡 Servidor ouvindo na porta ${PORT}`);
    console.log(`👉 Acesse: http://localhost:${PORT}`);
});
