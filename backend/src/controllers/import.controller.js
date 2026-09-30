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

function buscarEDS(estaciones, codigo) {
  if (!codigo) return null;
  const c = String(codigo).trim();
  return estaciones.find(e => String(e.codigocliente2wdesk ?? '').trim() === c) || null;
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

const fmtDateTime = d => d ? d.toISOString().replace('T', ' ').slice(0, 19) : null;

// Corre `fn` sobre `items` con como máximo `limite` llamadas en vuelo al mismo tiempo,
// en vez de una por una — cada llamada sigue siendo una consulta SQL separada (nada de
// batch real), pero varias viajan al servidor en simultáneo, así que el tiempo total baja
// casi proporcional al límite sin arriesgar la corrección de un INSERT/UPDATE por lotes.
async function conPool(items, limite, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limite, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

async function cargarCatalogos(db) {
  const [a, c, t, e, p, g, s] = await Promise.all([
    db.request().query(`SELECT id, nombre, idGrupoColaborador FROM analistas WHERE idRol = 1`),
    db.request().query(`SELECT id, nombre FROM categorias`),
    db.request().query(`SELECT id, nombre FROM tiposCaso`),
    db.request().query(`SELECT id, nombre FROM estatus`),
    db.request().query(`SELECT id, nombre FROM prioridad`),
    db.request().query(`SELECT id, nombre FROM gruposColaborador`),
    db.request().query(`SELECT id, nombre, codigocliente2wdesk FROM estaciones WHERE existe = 1`),
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
             CONVERT(VARCHAR(19), fechaCaso, 120) AS fechaCaso
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
      const edsNombre = edsMatch ? edsMatch.nombre : (nombreClienteNom || (codCliente ? String(codCliente).trim() : null));
      const clienteNoRegistrado = !edsMatch;

      const analistaMatch  = creadoPorNom
        ? buscar(cat.analistas, creadoPorNom)
        : null;

      const estatusMatch = buscar(cat.estatus, estatusNom);
      const esCerrado    = estatusMatch?.id === 1 || estatusMatch?.id === 2;

      let escaladoMatch;
      if (responsableNom) {
        escaladoMatch = buscar(cat.analistas, responsableNom);
      } else if (esCerrado) {
        escaladoMatch = analistaMatch;
      } else {
        escaladoMatch = null;
      }

      const malEscalado = !responsableNom && !esCerrado;

      // grupo del TICKET (excel > responsable > creador), se crea si no existe.
      // No afecta al grupo del analista, ese siempre queda en NULL (asignación manual).
      let grupoMatch = buscar(cat.grupos, grupoNom);
      if (!grupoMatch) {
        const fuenteGrupo = escaladoMatch || analistaMatch;
        if (fuenteGrupo?.idGrupoColaborador) {
          grupoMatch = cat.grupos.find(g => g.id === fuenteGrupo.idGrupoColaborador) || null;
        }
      }

      const tipoMatch      = buscar(cat.tiposCaso,  tipoNom);
      const catMatch       = buscar(cat.categorias, catNom);
      const prioridadMatch = buscar(cat.prioridad,  prioridadNom);

      // Valores que no existen todavia en el catalogo: se crean en confirmarImport
      const estatusNuevo   = (estatusNom  && !estatusMatch)       ? estatusNom  : null;
      const categoriaNueva = (catNom      && !catMatch)           ? catNom      : null;
      const tipoNuevo      = (tipoNom     && !tipoMatch)          ? tipoNom     : null;
      const grupoNuevo     = (grupoNom    && !grupoMatch)         ? grupoNom    : null;

      const errores = [];
      if (clienteNoRegistrado) errores.push(codCliente ? `Cliente "${codCliente}" no registrado — importe clientes primero` : 'Sin cliente — importe clientes primero');
      if (!titulo) errores.push('Sin título (TÍTULO vacío)');
      if (tipoNuevo)      errores.push(`Tipo de solicitud nuevo: "${tipoNuevo}" (se creará)`);
      if (categoriaNueva) errores.push(`Categoría nueva: "${categoriaNueva}" (se creará)`);
      if (estatusNuevo)    errores.push(`Estatus nuevo: "${estatusNuevo}" (se creará)`);
      if (grupoNuevo)      errores.push(`Grupo de colaboradores nuevo: "${grupoNuevo}" (se creará)`);

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
        fechaCaso:          fmtDateTime(dFin),
        fechaHora:          fmtDateTime(dReg),
      };

      const existente = codigo ? existingMap.get(codigo) : null;
      let accion, camposModificados = [];

      const creadorNuevo   = (creadoPorNom   && !analistaMatch)  ? creadoPorNom   : null;
      const escaladoNuevo  = (responsableNom && !escaladoMatch)  ? responsableNom : null;

      if (existente) {
        camposModificados = detectarCambios(existente, nuevoData);
        if (!camposModificados.length && (creadorNuevo || escaladoNuevo || estatusNuevo || categoriaNueva || tipoNuevo || grupoNuevo)) {
          camposModificados = ['Catálogo (nuevo)'];
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
        clienteNoRegistrado,
        creadoPorNom,
        creadorNuevo,
        responsableNom,
        escaladoNuevo,
        estatusNuevo,
        categoriaNueva,
        tipoNuevo,
        grupoNuevo,
        tipoNom,
        catNom,
        estatusNom,
        prioridadNom,
        grupoNom,
        malEscalado,
        accion,
        estado:             clienteNoRegistrado ? 'error' : (errores.length ? 'advertencia' : 'ok'),
        camposModificados,
        errores,
      };
    });

    const erroresBloqueantes = filas.filter(f => f.estado === 'error').length;

    res.json({
      total:        filas.length,
      insertar:            filas.filter(f => f.accion === 'insertar' && f.estado !== 'error').length,
      actualizar:          filas.filter(f => f.accion === 'actualizar' && f.estado !== 'error').length,
      omitir:              filas.filter(f => f.accion === 'omitir').length,
      advertencias:        filas.filter(f => f.estado === 'advertencia').length,
      erroresBloqueantes,
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
    let insertados = 0, actualizados = 0;
    let analistasCreados = 0, estatusCreados = 0, categoriasCreadas = 0, tiposCreados = 0, gruposCreados = 0;
    const errores = [];

    // crea o reutiliza catálogos nuevos del Excel (estatus, categoría, tipo, grupo del ticket)
    const estatusNuevosSet = new Set();
    const categoriasNuevasSet = new Set(), tiposNuevosSet = new Set();
    const gruposNuevosSet = new Set();
    for (const f of filas) {
      if (f.accion === 'omitir') continue;
      if (f.estado === 'advertencia' && !incluirAdvertencias) continue;
      if (f.estatusNuevo)   estatusNuevosSet.add(f.estatusNuevo);
      if (f.categoriaNueva) categoriasNuevasSet.add(f.categoriaNueva);
      if (f.tipoNuevo)      tiposNuevosSet.add(f.tipoNuevo);
      if (f.grupoNuevo)     gruposNuevosSet.add(f.grupoNuevo);
    }

    const estatusNuevosMap = new Map();
    for (const nombre of estatusNuevosSet) {
      try {
        const check = await db.request()
          .input('n', sql.NVarChar, nombre)
          .query(`SELECT id FROM estatus WHERE nombre = @n`);
        if (check.recordset.length) {
          estatusNuevosMap.set(nombre, check.recordset[0].id);
        } else {
          const ins = await db.request()
            .input('n', sql.NVarChar, nombre)
            .query(`INSERT INTO estatus (nombre) OUTPUT INSERTED.id VALUES (@n)`);
          estatusNuevosMap.set(nombre, ins.recordset[0].id);
          estatusCreados++;
        }
      } catch (e) { errores.push(`Estatus "${nombre}": ${e.message}`); }
    }

    const categoriasNuevasMap = new Map();
    for (const nombre of categoriasNuevasSet) {
      try {
        const check = await db.request()
          .input('n', sql.NVarChar, nombre)
          .query(`SELECT id FROM categorias WHERE nombre = @n`);
        if (check.recordset.length) {
          categoriasNuevasMap.set(nombre, check.recordset[0].id);
        } else {
          const principal = nombre.includes(' / ') ? nombre.split(' / ')[0].trim() : nombre;
          const ins = await db.request()
            .input('n', sql.NVarChar, nombre)
            .input('p', sql.NVarChar, principal)
            .query(`INSERT INTO categorias (nombre, activo, categoriaprincipal)
                    OUTPUT INSERTED.id VALUES (@n, 1, @p)`);
          categoriasNuevasMap.set(nombre, ins.recordset[0].id);
          categoriasCreadas++;
        }
      } catch (e) { errores.push(`Categoría "${nombre}": ${e.message}`); }
    }

    const tiposNuevosMap = new Map();
    for (const nombre of tiposNuevosSet) {
      try {
        const check = await db.request()
          .input('n', sql.NVarChar, nombre)
          .query(`SELECT id FROM tiposCaso WHERE nombre = @n`);
        if (check.recordset.length) {
          tiposNuevosMap.set(nombre, check.recordset[0].id);
        } else {
          const ins = await db.request()
            .input('n', sql.NVarChar, nombre)
            .query(`INSERT INTO tiposCaso (nombre, activo) OUTPUT INSERTED.id VALUES (@n, 1)`);
          tiposNuevosMap.set(nombre, ins.recordset[0].id);
          tiposCreados++;
        }
      } catch (e) { errores.push(`Tipo de solicitud "${nombre}": ${e.message}`); }
    }

    const gruposNuevosMap = new Map();
    for (const nombre of gruposNuevosSet) {
      try {
        const check = await db.request()
          .input('n', sql.NVarChar, nombre)
          .query(`SELECT id FROM gruposColaborador WHERE nombre = @n`);
        if (check.recordset.length) {
          gruposNuevosMap.set(nombre, check.recordset[0].id);
        } else {
          const ins = await db.request()
            .input('n', sql.NVarChar, nombre)
            .query(`INSERT INTO gruposColaborador (nombre) OUTPUT INSERTED.id VALUES (@n)`);
          gruposNuevosMap.set(nombre, ins.recordset[0].id);
          gruposCreados++;
        }
      } catch (e) { errores.push(`Grupo de colaboradores "${nombre}": ${e.message}`); }
    }

    // analistas nuevos se crean sin grupo, esa asignación siempre es manual
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

    const filasAProcesar = filas.filter(f =>
      f.accion !== 'omitir' && f.estado !== 'error' && !(f.estado === 'advertencia' && !incluirAdvertencias)
    );

    // Limitado a propósito (no al máximo de conexiones del pool) para no acaparar la
    // base de datos mientras el resto del sistema sigue en uso durante el import.
    const CONCURRENCIA_FILAS = 5;
    await conPool(filasAProcesar, CONCURRENCIA_FILAS, async (f) => {
      try {
        if (f.accion === 'insertar') {
          const idCategoria        = f.idCategoria        ?? (f.categoriaNueva ? categoriasNuevasMap.get(f.categoriaNueva) : null) ?? null;
          const idTipoCaso         = f.idTipoCaso         ?? (f.tipoNuevo      ? tiposNuevosMap.get(f.tipoNuevo)           : null) ?? null;
          const idEstatus          = f.idEstatus          ?? (f.estatusNuevo   ? estatusNuevosMap.get(f.estatusNuevo)      : null) ?? null;
          const idGrupoColaborador = f.idGrupoColaborador ?? (f.grupoNuevo     ? gruposNuevosMap.get(f.grupoNuevo)         : null) ?? null;

          const idAna     = f.idAnalista ?? (f.creadorNuevo  ? analNuevosMap.get(f.creadorNuevo)  : null) ?? null;
          const esCerrado = [1, 2].includes(idEstatus);
          const idEsc     = f.escalado   ?? (f.escaladoNuevo ? analNuevosMap.get(f.escaladoNuevo) : null) ?? (esCerrado ? idAna : null);
          await db.request()
            .input('casoAtendido',        sql.NVarChar, f.casoAtendido       || null)
            .input('EDS',                 sql.NVarChar, f.eds                || null)
            .input('idTipoCaso',          sql.Int,      idTipoCaso)
            .input('idCategoria',         sql.Int,      idCategoria)
            .input('origenFalla',         sql.NVarChar, f.origenFalla        || null)
            .input('solucion',            sql.NVarChar, null)
            .input('idAnalista',          sql.Int,      idAna)
            .input('escalado',            sql.Int,      idEsc)
            .input('tiempoAtencionMin',   sql.Int,      null)
            .input('versiones',           sql.NVarChar, null)
            .input('observaciones',       sql.NVarChar, f.observaciones      || null)
            .input('fechaCaso',           sql.DateTime, f.fechaCaso  ? new Date(f.fechaCaso)  : null)
            .input('fechaHora',           sql.DateTime, f.fechaHora  ? new Date(f.fechaHora)  : new Date())
            .input('codigo2wd',           sql.NVarChar, f.codigo2wd          || null)
            .input('idEstatus',           sql.Int,      idEstatus)
            .input('idPrioridad',         sql.Int,      f.idPrioridad        || null)
            .input('idGrupoColaborador',  sql.Int,      idGrupoColaborador)
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
          const idCategoria        = f.idCategoria        ?? (f.categoriaNueva ? categoriasNuevasMap.get(f.categoriaNueva) : null) ?? null;
          const idTipoCaso         = f.idTipoCaso         ?? (f.tipoNuevo      ? tiposNuevosMap.get(f.tipoNuevo)           : null) ?? null;
          const idEstatus          = f.idEstatus          ?? (f.estatusNuevo   ? estatusNuevosMap.get(f.estatusNuevo)      : null) ?? null;
          const idGrupoColaborador = f.idGrupoColaborador ?? (f.grupoNuevo     ? gruposNuevosMap.get(f.grupoNuevo)         : null) ?? null;

          const idAna     = f.idAnalista ?? (f.creadorNuevo  ? analNuevosMap.get(f.creadorNuevo)  : null) ?? null;
          const esCerrado = [1, 2].includes(idEstatus);
          const idEsc     = f.escalado   ?? (f.escaladoNuevo ? analNuevosMap.get(f.escaladoNuevo) : null) ?? (esCerrado ? idAna : null);
          const sets = [];
          const r = db.request().input('codigo', sql.NVarChar, f.codigo2wd);

          if (f.casoAtendido)       { sets.push('casoAtendido = @casoAtendido');             r.input('casoAtendido',       sql.NVarChar, f.casoAtendido); }
          if (f.eds)                { sets.push('EDS = @EDS');                               r.input('EDS',                sql.NVarChar, f.eds); }
          if (idTipoCaso)           { sets.push('idTipoCaso = @idTipoCaso');                 r.input('idTipoCaso',         sql.Int,      idTipoCaso); }
          if (idCategoria)          { sets.push('idCategoria = @idCategoria');               r.input('idCategoria',        sql.Int,      idCategoria); }
          if (f.origenFalla)        { sets.push('origenFalla = @origenFalla');               r.input('origenFalla',        sql.NVarChar, f.origenFalla); }
          if (idAna)                { sets.push('idAnalista = @idAnalista');                 r.input('idAnalista',         sql.Int,      idAna); }
          if (idEsc)                { sets.push('escalado = @escalado');                     r.input('escalado',           sql.Int,      idEsc); }
          if (f.observaciones)      { sets.push('observaciones = @observaciones');           r.input('observaciones',      sql.NVarChar, f.observaciones); }
          if (f.fechaCaso)          { sets.push('fechaCaso = @fechaCaso');                   r.input('fechaCaso',          sql.DateTime, new Date(f.fechaCaso)); }
          if (f.fechaHora)          { sets.push('fechaHora = @fechaHora');                   r.input('fechaHora',          sql.DateTime, new Date(f.fechaHora)); }
          if (idEstatus)            { sets.push('idEstatus = @idEstatus');                   r.input('idEstatus',          sql.Int,      idEstatus); }
          if (f.idPrioridad)        { sets.push('idPrioridad = @idPrioridad');               r.input('idPrioridad',        sql.Int,      f.idPrioridad); }
          if (idGrupoColaborador)   { sets.push('idGrupoColaborador = @idGrupoColaborador'); r.input('idGrupoColaborador', sql.Int,      idGrupoColaborador); }

          if (sets.length > 0) {
            await r.query(`UPDATE tickets SET ${sets.join(', ')} WHERE codigo2wd = @codigo`);
            actualizados++;
          }
        }
      } catch (e) {
        errores.push(`Fila ${f.fila}: ${e.message}`);
      }
    });

    const io = req.app.get('io');
    io.emit('ticketsActualizados');

    res.json({
      ok: true, insertados, actualizados, analistasCreados,
      estatusCreados, categoriasCreadas, tiposCreados, gruposCreados,
      errores,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { previewExcel, confirmarImport };
