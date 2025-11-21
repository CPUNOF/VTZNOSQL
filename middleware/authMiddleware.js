const jwt = require('jsonwebtoken');
require('dotenv').config();

// 1. Verifica se o Token é VÁLIDO e o decodifica
const validarToken = (req, res, next) => {
    // O token vem no formato "Bearer asdñfkj..."
    const authHeader = req.header('Authorization');

    // Se o token não existir, nega o acesso
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ msg: 'Acesso negado. Token ausente ou mal formatado.' });
    }

    // Extrai o token sem a palavra 'Bearer '
    const token = authHeader.split(' ')[1]; 
    
    try {
        // Verifica o token usando a chave secreta
        const decodificado = jwt.verify(token, process.env.JWT_SECRET);
        
        // Adiciona as informações do usuário (cargo, id) na requisição
        req.usuario = decodificado;
        next(); // Token válido, pode seguir
    } catch (error) {
        // Token inválido, expirado ou adulterado
        return res.status(401).json({ msg: 'Token inválido ou expirado.' });
    }
};

// 2. Verifica se, além de válido, o usuário é ADMINISTRADOR
const isAdmin = (req, res, next) => {
    // A função validarToken já rodou e colocou as informações do usuário em req.usuario
    if (req.usuario && req.usuario.cargo === 'admin') {
        next(); // É admin, pode seguir
    } else {
        // Bloqueia com Erro 403 (Proibido)
        return res.status(403).json({ msg: 'Acesso Negado. Ação exclusiva para Administradores.' });
    }
};

module.exports = { validarToken, isAdmin };