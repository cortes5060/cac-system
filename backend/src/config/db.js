const sql = require('mssql');

const config = {
  user:     process.env.DB_USER ,
  password: process.env.DB_PASSWORD,
  server:   process.env.DB_SERVER,
  port:     parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  options: {
    trustServerCertificate: true
  }
};

const pool = new sql.ConnectionPool(config).connect();

module.exports = { sql, pool };
