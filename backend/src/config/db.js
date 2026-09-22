const sql = require('mssql');

const config = {
  user:     process.env.DB_USER     || 'cac',
  password: process.env.DB_PASSWORD || 'cac123',
  server:   process.env.DB_SERVER   || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 1433,
  database: process.env.DB_NAME     || 'CAC',
  // El equipo puede ir lento: 15 s (por defecto) no alcanza en los picos de carga
  connectionTimeout: 60000,
  requestTimeout:    60000,
  options: {
    trustServerCertificate: true
  }
};

const pool = new sql.ConnectionPool(config).connect();

module.exports = { sql, pool };
