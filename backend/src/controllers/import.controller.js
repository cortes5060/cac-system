const { sql, pool } = require('../config/db');
const xlsx = require('xlsx');

const norm = s =>
  (s ?? '').toString().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim();

function buscar(lista, valor) {
  if (!valor) return null;
  const n = norm(valor);
  if (!n) return null;
  return lista.find(x => norm(x.nombre) === n)
      || lista.find(x => norm(x.nombre).startsWith(n) || n.startsWith(norm(x.nombre)))
      || null;
}

function buscarEDS(estaciones, codigoCliente) {
  if (!codigoCliente) return null;
  const nit = String(codigoCliente).trim();
  return estaciones.find(e => String(e.NIT ?? '').trim() === nit) || null;
}

function toDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === 'string' && val.trim()) {
    const d = new Date(val.trim());
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

const fmtDate     = d => d ? d.toISOString().slice(0, 10) : null;
const fmtDateTime = d => d ? d.toISOString().replace('T', ' ').slice(0, 19) : null;

async function cargarCatalogos(db) {
  const [a, c, t, e, p, g, s] = await Promise.all([
    db.request().query(`SELECT id, nombre FROM analistas WHERE idRol = 1`),
    db.request().query(`SELECT id, nombre FROM categorias`),
    db.request().query(`SELECT id, nombre FROM tiposCaso`),
    db.request().query(`SELECT id, nombre FROM estatus`),
    db.request().query(`SELECT id, nombre FROM prioridad`),
    db.request().query(`SELECT id, nombre FROM gruposColaborador`),
    db.request().query(`SELECT id, nombre, NIT FROM estaciones WHERE existe = 1`),
  ]);
  return {
    analistas:     a.recordset,
    sinResponsable: a.recordset.find(x => norm(x.nombre) === 'sin responsable') || null,
    categorias:    c.recordset,
    tiposCaso:     t.recordset,
    estatus:       e.recordset,
    prioridad:     p.recordset,
    grupos:        g.recordset,
    estaciones:    s.recordset,
  };
}

function detectarCambios(ex, nu) {
  const cambios = [];

  const cmpTexto = (nombre, vOld, vNew) => {
    if (vNew !== null && vNew !== undefined && vNew !== '') {
      if ((vOld ?? '').toString().trim() !== (vNew ?? '').toString().trim())
        cambios.push(nombre);
    }
  };

  const cmpId = (nombre, vOld, vNew) => {
    if (vNew !== null && vNew !== undefined) {
      if ((vOld ?? null) !== (vNew ?? null)) cambios.push(nombre);
    }
  };

  cmpTexto('Título',      ex.casoAtendido,       nu.casoAtendido);
  cmpTexto('EDS',         ex.EDS,                nu.eds);
  cmpTexto('Origen',      ex.origenFalla,        nu.origenFalla);
  cmpTexto('Descripción', ex.observaciones,      nu.observaciones);
  cmpTexto('Fecha caso',  ex.fechaCaso,          nu.fechaCaso);
  cmpId('Creador',        ex.idAnalista,         nu.idAnalista);
  cmpId('Escalado',       ex.escalado,           nu.escalado);
  cmpId('Tipo',           ex.idTipoCaso,         nu.idTipoCaso);
  cmpId('Categoría',      ex.idCategoria,        nu.idCategoria);
  cmpId('Estatus',        ex.idEstatus,          nu.idEstatus);
  cmpId('Prioridad',      ex.idPrioridad,        nu.idPrioridad);
  cmpId('Grupo',          ex.idGrupoColaborador, nu.idGrupoColaborador);

  return cambios;
}

const previewExcel = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });

    const wb   = xlsx.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws, { defval: '' });

    if (!rows.length) return res.status(400).json({ error: 'El archivo está vacío o sin datos' });

    const db  = await pool;
    const cat = await cargarCatalogos(db);

    const existR = await db.request().query(`
      SELECT codigo2wd, casoAtendido, EDS, idAnalista, escalado, idTipoCaso, idCategoria,
             idEstatus, idPrioridad, idGrupoColaborador, origenFalla, observaciones,
             CONVERT(VARCHAR(10), fechaCaso, 23) AS fechaCaso
      FROM tickets WHERE codigo2wd IS NOT NULL
    `);
    const existingMap = new Map(
      existR.recordset.map(r => [String(r.codigo2wd).trim(), r])
    );

    const filas = rows.map((row, idx) => {
      const normK = k => k.toString().toUpperCase().trim().replace(/\s+/g, ' ');
      const rowN  = {};
      for (const [k, v] of Object.entries(row)) rowN[normK(k)] = v;
      const get   = k => String(rowN[normK(k)] ?? '').trim();

      const codigo         = get('CÓDIGO')             || get('CODIGO');
      const titulo         = get('TÍTULO')             || get('TITULO');
      const desc           = get('DESCRIPCIÓN')        || get('DESCRIPCION');
      const origen         = get('ORIGEN');
      const codCliente     = get('CÓDIGO DEL CLIENTE') || get('CODIGO DEL CLIENTE');
      const prioridadNom   = get('PRIORIDAD');
      const grupoNom       = get('GRUPO DE COLABORADOR')
                          || get('GRUPO DE COLABORADORES')
                          || get('GRUPO DE COLA')
                          || get('GRUPO COLABORADOR')
                          || get('GRUPO DE TRABAJO')
                          || get('GRUPO')
                          || get('COLA');
      const creadoPorNom   = get('QUIÉN CREÓ')      || get('QUIEN CREO')
                          || get('CREADO POR')       || get('CREADOR');
      const responsableNom = get('USUARIO RESPONSABLE');
      const tipoNom        = get('TIPO DE SOLICITUD');
      const catNom         = get('CATEGORÍA')        || get('CATEGORIA');
      const estatusNom     = get('ESTATUS');

      const dReg = toDate(rowN[normK('FECHA DE REGISTRO')]);
      const dFin = toDate(
        rowN[normK('FECHA DE FINALIZACIÓN')] ??
        rowN[normK('FECHA DE FINALIZACION')] ??
        rowN[normK('FECHA DE FIN')]
      );

      const nombreClienteNom = get('NOMBRE CLIENTE') || get('NOMBRE DEL CLIENTE');
      const direccionNom     = get('DIRECCIÓN')      || get('DIRECCION');

      const edsMatch = buscarEDS(cat.estaciones, codCliente);
      let edsNueva = null, edsNombre;
      if (edsMatch) {
        edsNombre = edsMatch.nombre;
      } else if (codCliente) {
        edsNombre = nombreClienteNom || `NIT:${codCliente}`;
        edsNueva  = { NIT: codCliente, nombre: nombreClienteNom || `EDS ${codCliente}`, direccion: direccionNom || null };
      } else {
        edsNombre = null;
      }

      const analistaMatch  = creadoPorNom
        ? buscar(cat.analistas, creadoPorNom)
        : null;

      const estatusMatch   = buscar(cat.estatus,    estatusNom);
      const esCerrado      = ['cerrado','cancelado'].includes(norm(estatusNom));
      let escaladoMatch;
      if (responsableNom) {
        escaladoMatch = buscar(cat.analistas, responsableNom);
      } else {
        escaladoMatch = analistaMatch;
      }

      const tipoMatch      = buscar(cat.tiposCaso,  tipoNom);
      const catMatch       = buscar(cat.categorias, catNom);
      const prioridadMatch = buscar(cat.prioridad,  prioridadNom);
      const grupoMatch     = buscar(cat.grupos,     grupoNom);

      const errores = [];
      if (!titulo) errores.push('Sin título (TÍTULO vacío)');
      if (tipoNom && !tipoMatch) errores.push(`Tipo de solicitud no encontrado: "${tipoNom}"`);
      if (catNom  && !catMatch)  errores.push(`Categoría no encontrada: "${catNom}"`);

      const nuevoData = {
        casoAtendido:       titulo   || null,
        eds:                edsNombre,
        idAnalista:         analistaMatch?.id   ?? null,
        escalado:           escaladoMatch?.id   ?? null,
        idTipoCaso:         tipoMatch?.id       ?? null,
        idCategoria:        catMatch?.id        ?? null,
        idEstatus:          estatusMatch?.id    ?? null,
        idPrioridad:        prioridadMatch?.id  ?? null,
        idGrupoColaborador: grupoMatch?.id      ?? null,
        origenFalla:        origen   || null,
        observaciones:      desc     || null,
        fechaCaso:          fmtDate(dFin),
        fechaHora:          fmtDateTime(dReg),
      };

      const existente = codigo ? existingMap.get(codigo) : null;
      let accion, camposModificados = [];

      const creadorNuevo   = (creadoPorNom   && !analistaMatch)  ? creadoPorNom   : null;
      const escaladoNuevo  = (responsableNom && !escaladoMatch)  ? responsableNom : null;

      if (existente) {
        camposModificados = detectarCambios(existente, nuevoData);
        if (!camposModificados.length && (creadorNuevo || escaladoNuevo)) {
          camposModificados = ['Analista (nuevo)'];
        }
        accion = camposModificados.length ? 'actualizar' : 'omitir';
      } else {
        accion = 'insertar';
      }

      return {
        fila:               idx + 2,
        codigo2wd:          codigo || null,
        ...nuevoData,
        edsEncontrada:      !!edsMatch,
        edsNueva,
        creadoPorNom,
        creadorNuevo,
        responsableNom,
        escaladoNuevo,
        tipoNom,
        catNom,
        estatusNom,
        prioridadNom,
        grupoNom,
        accion,
        estado:             errores.length ? 'advertencia' : 'ok',
        camposModificados,
        errores,
      };
    });

    const nitsSeen  = new Set();
    let   edsNuevas = 0;
    for (const f of filas) {
      if (f.edsNueva && !nitsSeen.has(f.edsNueva.NIT)) {
        nitsSeen.add(f.edsNueva.NIT);
        edsNuevas++;
      }
    }

    res.json({
      total:        filas.length,
      insertar:     filas.filter(f => f.accion === 'insertar').length,
      actualizar:   filas.filter(f => f.accion === 'actualizar').length,
      omitir:       filas.filter(f => f.accion === 'omitir').length,
      advertencias: filas.filter(f => f.estado === 'advertencia').length,
      edsNuevas,
      filas,
    });
  } catch (err) {
    console.error('previewExcel:', err);
    res.status(500).json({ error: err.message });
  }
};

const confirmarImport = async (req, res) => {
  try {
    const { filas, incluirAdvertencias = false } = req.body;
    if (!Array.isArray(filas) || !filas.length)
      return res.status(400).json({ error: 'Sin filas para importar' });

    const db = await pool;
    let insertados = 0, actualizados = 0, edsCreadas = 0, analistasCreados = 0;
    const errores = [];

    // analistas nuevos
    const analNuevosMap = new Map();

    const nombresNuevos = new Set();
    for (const f of filas) {
      if (f.accion === 'omitir') continue;
      if (f.estado === 'advertencia' && !incluirAdvertencias) continue;
      if (f.creadorNuevo)  nombresNuevos.add(f.creadorNuevo);
      if (f.escaladoNuevo) nombresNuevos.add(f.escaladoNuevo);
    }

    for (const nombre of nombresNuevos) {
      try {
        const check = await db.request()
          .input('n', sql.NVarChar, nombre)
          .query(`SELECT id FROM analistas WHERE nombre = @n`);
        if (check.recordset.length) {
          analNuevosMap.set(nombre, check.recordset[0].id);
        } else {
          const ins = await db.request()
            .input('n', sql.NVarChar, nombre)
            .query(`INSERT INTO analistas (nombre, orden, activo, existe, idRol)
                    OUTPUT INSERTED.id VALUES (@n, 0, 0, 0, 1)`);
          analNuevosMap.set(nombre, ins.recordset[0].id);
          analistasCreados++;
        }
      } catch (e) {
        errores.push(`Analista "${nombre}": ${e.message}`);
      }
    }

    // EDS nuevas
    const nitsSeen = new Set();
    for (const f of filas) {
      if (f.accion === 'omitir') continue;
      if (f.estado === 'advertencia' && !incluirAdvertencias) continue;
      if (!f.edsNueva || nitsSeen.has(f.edsNueva.NIT)) continue;
      nitsSeen.add(f.edsNueva.NIT);

      try {
        const check = await db.request()
          .input('nit', sql.NVarChar, f.edsNueva.NIT)
          .query(`SELECT id FROM estaciones WHERE NIT = @nit`);
        if (!check.recordset.length) {
          await db.request()
            .input('nombre',    sql.NVarChar, f.edsNueva.nombre)
            .input('nit',       sql.NVarChar, f.edsNueva.NIT)
            .input('direccion', sql.NVarChar, f.edsNueva.direccion || null)
            .query(`INSERT INTO estaciones (nombre, NIT, direccion, existe) VALUES (@nombre, @nit, @direccion, 1)`);
          edsCreadas++;
        }
      } catch (e) {
        errores.push(`EDS NIT ${f.edsNueva.NIT}: ${e.message}`);
      }
    }

    // tickets
    for (const f of filas) {
      if (f.accion === 'omitir') continue;
      if (f.estado === 'advertencia' && !incluirAdvertencias) continue;

      try {
        if (f.accion === 'insertar') {
          const idAna = f.idAnalista ?? (f.creadorNuevo  ? analNuevosMap.get(f.creadorNuevo)  : null) ?? null;
          const idEsc = f.escalado   ?? (f.escaladoNuevo ? analNuevosMap.get(f.escaladoNuevo) : null) ?? idAna;
          await db.request()
            .input('casoAtendido',        sql.NVarChar, f.casoAtendido       || null)
            .input('EDS',                 sql.NVarChar, f.eds                || null)
            .input('idTipoCaso',          sql.Int,      f.idTipoCaso         || null)
            .input('idCategoria',         sql.Int,      f.idCategoria        || null)
            .input('origenFalla',         sql.NVarChar, f.origenFalla        || null)
            .input('solucion',            sql.NVarChar, null)
            .input('idAnalista',          sql.Int,      idAna)
            .input('escalado',            sql.Int,      idEsc)
            .input('tiempoAtencionMin',   sql.Int,      null)
            .input('versiones',           sql.NVarChar, null)
            .input('observaciones',       sql.NVarChar, f.observaciones      || null)
            .input('fechaCaso',           sql.Date,     f.fechaCaso  ? new Date(f.fechaCaso)  : null)
            .input('fechaHora',           sql.DateTime, f.fechaHora  ? new Date(f.fechaHora)  : new Date())
            .input('codigo2wd',           sql.NVarChar, f.codigo2wd          || null)
            .input('idEstatus',           sql.Int,      f.idEstatus          || null)
            .input('idPrioridad',         sql.Int,      f.idPrioridad        || null)
            .input('idGrupoColaborador',  sql.Int,      f.idGrupoColaborador || null)
            .query(`
              INSERT INTO tickets (
                casoAtendido, EDS, idTipoCaso, idCategoria, origenFalla, solucion,
                idAnalista, escalado, tiempoAtencionMin, versiones, observaciones,
                fechaCaso, fechaHora,
                codigo2wd, idEstatus, idPrioridad, idGrupoColaborador
              ) VALUES (
                @casoAtendido, @EDS, @idTipoCaso, @idCategoria, @origenFalla, @solucion,
                @idAnalista, @escalado, @tiempoAtencionMin, @versiones, @observaciones,
                @fechaCaso, @fechaHora,
                @codigo2wd, @idEstatus, @idPrioridad, @idGrupoColaborador
              )
            `);
          insertados++;

        } else if (f.accion === 'actualizar' && f.codigo2wd) {
          const idAna = f.idAnalista ?? (f.creadorNuevo  ? analNuevosMap.get(f.creadorNuevo)  : null) ?? null;
          const idEsc = f.escalado   ?? (f.escaladoNuevo ? analNuevosMap.get(f.escaladoNuevo) : null) ?? idAna;
          const sets = [];
          const r = db.request().input('codigo', sql.NVarChar, f.codigo2wd);

          if (f.casoAtendido)       { sets.push('casoAtendido = @casoAtendido');             r.input('casoAtendido',       sql.NVarChar, f.casoAtendido); }
          if (f.eds)                { sets.push('EDS = @EDS');                               r.input('EDS',                sql.NVarChar, f.eds); }
          if (f.idTipoCaso)         { sets.push('idTipoCaso = @idTipoCaso');                 r.input('idTipoCaso',         sql.Int,      f.idTipoCaso); }
          if (f.idCategoria)        { sets.push('idCategoria = @idCategoria');               r.input('idCategoria',        sql.Int,      f.idCategoria); }
          if (f.origenFalla)        { sets.push('origenFalla = @origenFalla');               r.input('origenFalla',        sql.NVarChar, f.origenFalla); }
          if (idAna)                { sets.push('idAnalista = @idAnalista');                 r.input('idAnalista',         sql.Int,      idAna); }
          if (idEsc)                { sets.push('escalado = @escalado');                     r.input('escalado',           sql.Int,      idEsc); }
          if (f.observaciones)      { sets.push('observaciones = @observaciones');           r.input('observaciones',      sql.NVarChar, f.observaciones); }
          if (f.fechaCaso)          { sets.push('fechaCaso = @fechaCaso');                   r.input('fechaCaso',          sql.Date,     new Date(f.fechaCaso)); }
          if (f.fechaHora)          { sets.push('fechaHora = @fechaHora');                   r.input('fechaHora',          sql.DateTime, new Date(f.fechaHora)); }
          if (f.idEstatus)          { sets.push('idEstatus = @idEstatus');                   r.input('idEstatus',          sql.Int,      f.idEstatus); }
          if (f.idPrioridad)        { sets.push('idPrioridad = @idPrioridad');               r.input('idPrioridad',        sql.Int,      f.idPrioridad); }
          if (f.idGrupoColaborador) { sets.push('idGrupoColaborador = @idGrupoColaborador'); r.input('idGrupoColaborador', sql.Int,      f.idGrupoColaborador); }

          if (sets.length > 0) {
            await r.query(`UPDATE tickets SET ${sets.join(', ')} WHERE codigo2wd = @codigo`);
            actualizados++;
          }
        }
      } catch (e) {
        errores.push(`Fila ${f.fila}: ${e.message}`);
      }
    }

    const io = req.app.get('io');
    io.emit('ticketsActualizados');

    res.json({ ok: true, insertados, actualizados, edsCreadas, analistasCreados, errores });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { previewExcel, confirmarImport };
