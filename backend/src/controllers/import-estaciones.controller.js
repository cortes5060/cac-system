const { sql, pool } = require('../config/db');
const xlsx    = require('xlsx');
const multer  = require('multer');

const upload = multer({ storage: multer.memoryStorage() });

const norm = s =>
  (s ?? '').toString().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim();

const previewEstaciones = async (req, res) => {
  try {
    const buf = req.file?.buffer;
    if (!buf) return res.status(400).json({ error: 'Sin archivo' });

    const wb   = xlsx.read(buf, { type: 'buffer' });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws, { defval: '' });
    if (!rows.length) return res.status(400).json({ error: 'Excel vacío' });

    const db     = await pool;
    const existR = await db.request().query(
      `SELECT id, nombre, NIT, direccion, codigocliente2wdesk FROM estaciones`
    );
    const existentes = new Map(
      existR.recordset
        .filter(e => e.codigocliente2wdesk)
        .map(e => [String(e.codigocliente2wdesk).trim(), e])
    );

    const filas = rows.map((row, idx) => {
      const g = key => {
        const k = Object.keys(row).find(k => norm(k) === norm(key));
        return k ? String(row[k] ?? '').trim() : '';
      };

      const codigo    = g('Código')    || g('CÓDIGO')    || g('Codigo')    || g('CODIGO');
      const nombre    = g('Nombre')    || g('NOMBRE');
      const nit       = g('Número de identificación personal/empresarial')
                     || g('Numero de identificacion personal/empresarial')
                     || g('NIT');
      const direccion = g('Dirección') || g('DIRECCIÓN') || g('Direccion') || g('DIRECCION');

      const errores = [];
      if (!codigo) errores.push('Sin código de cliente (columna Código)');
      if (!nombre) errores.push('Sin nombre (columna Nombre)');

      const existente = codigo ? existentes.get(codigo) : null;
      let accion, camposModificados = [];

      if (!codigo) {
        accion = 'omitir';
      } else if (existente) {
        if (nombre    && existente.nombre    !== nombre)    camposModificados.push('Nombre');
        if (nit       && existente.NIT       !== nit)       camposModificados.push('NIT');
        if (direccion && existente.direccion !== direccion) camposModificados.push('Dirección');
        accion = camposModificados.length ? 'actualizar' : 'omitir';
      } else {
        accion = 'insertar';
      }

      return {
        fila: idx + 2,
        codigo, nombre, nit: nit || null, direccion: direccion || null,
        accion,
        estado: errores.length ? 'advertencia' : 'ok',
        errores,
        camposModificados,
      };
    });

    res.json({
      total:        filas.length,
      insertar:     filas.filter(f => f.accion === 'insertar').length,
      actualizar:   filas.filter(f => f.accion === 'actualizar').length,
      omitir:       filas.filter(f => f.accion === 'omitir').length,
      advertencias: filas.filter(f => f.estado === 'advertencia').length,
      filas,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const confirmarEstaciones = async (req, res) => {
  try {
    const { filas, incluirAdvertencias = false } = req.body;
    if (!filas?.length) return res.status(400).json({ error: 'Sin filas' });

    const db = await pool;
    let insertados = 0, actualizados = 0;
    const errores = [];

    for (const f of filas) {
      if (f.accion === 'omitir') continue;
      if (f.estado === 'advertencia' && !incluirAdvertencias) continue;
      if (!f.codigo) continue;

      try {
        if (f.accion === 'insertar') {
          await db.request()
            .input('codigo',    sql.NVarChar, f.codigo)
            .input('nombre',    sql.NVarChar, f.nombre        || null)
            .input('nit',       sql.NVarChar, f.nit           || null)
            .input('direccion', sql.NVarChar, f.direccion     || null)
            .query(`
              INSERT INTO estaciones (codigocliente2wdesk, nombre, NIT, direccion, existe)
              VALUES (@codigo, @nombre, @nit, @direccion, 1)
            `);
          insertados++;
        } else if (f.accion === 'actualizar') {
          const sets = [];
          const r = db.request().input('codigo', sql.NVarChar, f.codigo);
          if (f.nombre)    { sets.push('nombre    = @nombre');    r.input('nombre',    sql.NVarChar, f.nombre); }
          if (f.nit)       { sets.push('NIT       = @nit');       r.input('nit',       sql.NVarChar, f.nit); }
          if (f.direccion) { sets.push('direccion = @direccion'); r.input('direccion', sql.NVarChar, f.direccion); }
          if (sets.length) {
            await r.query(`UPDATE estaciones SET ${sets.join(', ')} WHERE codigocliente2wdesk = @codigo`);
            actualizados++;
          }
        }
      } catch (e) {
        errores.push(`Fila ${f.fila} (${f.codigo}): ${e.message}`);
      }
    }

    res.json({ ok: true, insertados, actualizados, errores });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { previewEstaciones, confirmarEstaciones, upload };
