const sql = require('mssql');

const config = {
  user:     process.env.DB_USER     || 'cac',
  password: process.env.DB_PASSWORD || 'cac123',
  server:   process.env.DB_SERVER   || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 1433,
  database: process.env.DB_NAME     || 'CAC',
  options: {
    trustServerCertificate: true
  }
};

const pool = new sql.ConnectionPool(config).connect();

module.exports = { sql, pool };
