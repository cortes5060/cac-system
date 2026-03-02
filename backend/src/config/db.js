const sql = require('mssql');

const config = {
  user: 'cac',              // o tu usuario
  password: 'cac123', // el mismo de SQL Server
  server: 'localhost',
  database: 'CAC',
  options: {
    trustServerCertificate: true
  }
};

const pool = new sql.ConnectionPool(config).connect();

module.exports = { sql, pool };