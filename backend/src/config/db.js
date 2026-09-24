const { Pool, types } = require('pg');

// bigint (COUNT, ids migrados como int8) y numeric llegan como texto: se pasan a número
// para que las comparaciones con === del backend y del frontend sigan funcionando
types.setTypeParser(20,   v => parseInt(v, 10));
types.setTypeParser(1700, v => parseFloat(v));

// timestamp sin zona: la BD guarda la hora local de Colombia. Se interpreta con ese desfase fijo
// (sin horario de verano) para no depender de la zona horaria del equipo donde corre Node.
const UTC_OFFSET = process.env.DB_UTC_OFFSET || '-05:00';
types.setTypeParser(1114, v => new Date(v.replace(' ', 'T') + UTC_OFFSET));

const pool = new Pool({
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host:     process.env.DB_SERVER,
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  // El equipo puede ir lento: hay que dar margen en los picos de carga
  connectionTimeoutMillis: 60000,
  statement_timeout:       60000,
  // LOCALTIMESTAMP / CURRENT_DATE usan esta zona (equivale al GETDATE() del servidor anterior)
  options: `-c TimeZone=${process.env.DB_TIMEZONE || 'America/Bogota'}`
});

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PostgreSQL:', err.message);
});

// Ejecuta una consulta con parámetros con nombre (@id) convirtiéndolos a los posicionales de pg ($1).
// Solo se envían los parámetros que aparecen en el texto; un mismo nombre repetido reutiliza su $n.
// `db` puede ser el pool o un cliente dentro de una transacción.
function query(text, params = {}, db = pool) {
  const values = [];
  const indices = {};

  const sqlText = text.replace(/@(\w+)/g, (match, name) => {
    if (!Object.prototype.hasOwnProperty.call(params, name)) return match;
    if (!indices[name]) {
      values.push(params[name] === undefined ? null : params[name]);
      indices[name] = values.length;
    }
    return '$' + indices[name];
  });

  return db.query(sqlText, values);
}

// Segundos entre dos momentos (equivale a DATEDIFF(SECOND, ini, fin)); si fin es NULL cuenta hasta ahora
function segundos(ini, fin) {
  return `EXTRACT(EPOCH FROM (COALESCE(${fin}, LOCALTIMESTAMP) - ${ini}))`;
}

module.exports = { pool, query, segundos };
