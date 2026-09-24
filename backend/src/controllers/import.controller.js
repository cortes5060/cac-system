const { query } = require('../config/db');
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

const fmtDate     = d => d ? d.toISOString().slice(0, 10) : null;
const fmtDateTime = d => d ? d.toISOString().replace('T', ' ').slice(0, 19) : null;

async function cargarCatalogos() {
  const [a, c, t, e, p, g, s] = await Promise.all([
    query(`SELECT id, nombre, "idGrupoColaborador" FROM analistas WHERE "idRol" = 1`),
    query(`SELECT id, nombre FROM categorias`),
    query(`SELECT id, nombre FROM "tiposCaso"`),
    query(`SELECT id, nombre FROM estatus`),
    query(`SELECT id, nombre FROM prioridad`),
    query(`SELECT id, nombre FROM "gruposColaborador"`),
    query(`SELECT id, nombre, codigocliente2wdesk FROM estaciones WHERE existe = '1'`),
  ]);
  return {
    analistas:     a.rows,
    sinResponsable: a.rows.find(x => norm(x.nombre) === 'sin responsable') || null,
    categorias:    c.rows,
    tiposCaso:     t.rows,
    estatus:       e.rows,
    prioridad:     p.rows,
    grupos:        g.rows,
    estaciones:    s.rows,
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

    const cat = await cargarCatalogos();

    const existR = await query(`
      SELECT codigo2wd, "casoAtendido", "EDS", "idAnalista", escalado, "idTipoCaso", "idCategoria",
             "idEstatus", "idPrioridad", "idGrupoColaborador", "origenFalla", observaciones,
             to_char("fechaCaso", 'YYYY-MM-DD') AS "fechaCaso"
      FROM tickets WHERE codigo2wd IS NOT NULL
    `);
    const existingMap = new Map(
      existR.rows.map(r => [String(r.codigo2wd).trim(), r])
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

      // escalado
      let escaladoMatch;
      if (responsableNom) {
        escaladoMatch = buscar(cat.analistas, responsableNom);
      } else if (esCerrado) {
        escaladoMatch = analistaMatch;
      } else {
        escaladoMatch = null;
      }

      const malEscalado = !responsableNom && !esCerrado;

      // grupo: excel > responsable > creador
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

      const errores = [];
      if (clienteNoRegistrado) errores.push(codCliente ? `Cliente "${codCliente}" no registrado — importe clientes primero` : 'Sin cliente — importe clientes primero');
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
        clienteNoRegistrado,
        creadoPorNom,
        creadorNuevo,
        responsableNom,
        escaladoNuevo,
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

    let insertados = 0, actualizados = 0, analistasCreados = 0;
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
        // Igual que en SQL Server: sin distinguir mayúsculas ni espacios al final
        const check = await query(
          `SELECT id FROM analistas WHERE LOWER(TRIM(nombre)) = LOWER(TRIM(@n))`,
          { n: nombre }
        );
        if (check.rows.length) {
          analNuevosMap.set(nombre, check.rows[0].id);
        } else {
          const ins = await query(`INSERT INTO analistas (nombre, orden, activo, existe, "idRol")
                    VALUES (@n, 0, '0', '0', 1) RETURNING id`, { n: nombre });
          analNuevosMap.set(nombre, ins.rows[0].id);
          analistasCreados++;
        }
      } catch (e) {
        errores.push(`Analista "${nombre}": ${e.message}`);
      }
    }


    // tickets
    for (const f of filas) {
      if (f.accion === 'omitir') continue;
      if (f.estado === 'error') continue;
      if (f.estado === 'advertencia' && !incluirAdvertencias) continue;

      try {
        if (f.accion === 'insertar') {
          const idAna     = f.idAnalista ?? (f.creadorNuevo  ? analNuevosMap.get(f.creadorNuevo)  : null) ?? null;
          const esCerrado = [1, 2].includes(f.idEstatus);
          const idEsc     = f.escalado   ?? (f.escaladoNuevo ? analNuevosMap.get(f.escaladoNuevo) : null) ?? (esCerrado ? idAna : null);
          // fechaHora vacía = momento de la importación
          await query(`
              INSERT INTO tickets (
                "casoAtendido", "EDS", "idTipoCaso", "idCategoria", "origenFalla", solucion,
                "idAnalista", escalado, "tiempoAtencionMin", versiones, observaciones,
                "fechaCaso", "fechaHora",
                codigo2wd, "idEstatus", "idPrioridad", "idGrupoColaborador"
              ) VALUES (
                @casoAtendido, @EDS, @idTipoCaso, @idCategoria, @origenFalla, NULL,
                @idAnalista, @escalado, NULL, NULL, @observaciones,
                @fechaCaso, COALESCE(@fechaHora::timestamp, LOCALTIMESTAMP),
                @codigo2wd, @idEstatus, @idPrioridad, @idGrupoColaborador
              )
            `, {
              casoAtendido:       f.casoAtendido       || null,
              EDS:                f.eds                || null,
              idTipoCaso:         f.idTipoCaso         || null,
              idCategoria:        f.idCategoria        || null,
              origenFalla:        f.origenFalla        || null,
              idAnalista:         idAna,
              escalado:           idEsc,
              observaciones:      f.observaciones      || null,
              fechaCaso:          f.fechaCaso          || null,
              fechaHora:          f.fechaHora          || null,
              codigo2wd:          f.codigo2wd          || null,
              idEstatus:          f.idEstatus          || null,
              idPrioridad:        f.idPrioridad        || null,
              idGrupoColaborador: f.idGrupoColaborador || null,
            });
          insertados++;

        } else if (f.accion === 'actualizar' && f.codigo2wd) {
          const idAna     = f.idAnalista ?? (f.creadorNuevo  ? analNuevosMap.get(f.creadorNuevo)  : null) ?? null;
          const esCerrado = [1, 2].includes(f.idEstatus);
          const idEsc     = f.escalado   ?? (f.escaladoNuevo ? analNuevosMap.get(f.escaladoNuevo) : null) ?? (esCerrado ? idAna : null);
          const sets = [];
          const prm = { codigo: f.codigo2wd };

          if (f.casoAtendido)       { sets.push('"casoAtendido" = @casoAtendido');             prm.casoAtendido       = f.casoAtendido; }
          if (f.eds)                { sets.push('"EDS" = @EDS');                               prm.EDS                = f.eds; }
          if (f.idTipoCaso)         { sets.push('"idTipoCaso" = @idTipoCaso');                 prm.idTipoCaso         = f.idTipoCaso; }
          if (f.idCategoria)        { sets.push('"idCategoria" = @idCategoria');               prm.idCategoria        = f.idCategoria; }
          if (f.origenFalla)        { sets.push('"origenFalla" = @origenFalla');               prm.origenFalla        = f.origenFalla; }
          if (idAna)                { sets.push('"idAnalista" = @idAnalista');                 prm.idAnalista         = idAna; }
          if (idEsc)                { sets.push('escalado = @escalado');                       prm.escalado           = idEsc; }
          if (f.observaciones)      { sets.push('observaciones = @observaciones');             prm.observaciones      = f.observaciones; }
          if (f.fechaCaso)          { sets.push('"fechaCaso" = @fechaCaso');                   prm.fechaCaso          = f.fechaCaso; }
          if (f.fechaHora)          { sets.push('"fechaHora" = @fechaHora');                   prm.fechaHora          = f.fechaHora; }
          if (f.idEstatus)          { sets.push('"idEstatus" = @idEstatus');                   prm.idEstatus          = f.idEstatus; }
          if (f.idPrioridad)        { sets.push('"idPrioridad" = @idPrioridad');               prm.idPrioridad        = f.idPrioridad; }
          if (f.idGrupoColaborador) { sets.push('"idGrupoColaborador" = @idGrupoColaborador'); prm.idGrupoColaborador = f.idGrupoColaborador; }

          if (sets.length > 0) {
            await query(`UPDATE tickets SET ${sets.join(', ')} WHERE codigo2wd = @codigo`, prm);
            actualizados++;
          }
        }
      } catch (e) {
        errores.push(`Fila ${f.fila}: ${e.message}`);
      }
    }

    const io = req.app.get('io');
    io.emit('ticketsActualizados');

    res.json({ ok: true, insertados, actualizados, analistasCreados, errores });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { previewExcel, confirmarImport };
