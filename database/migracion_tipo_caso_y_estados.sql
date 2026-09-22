/* =====================================================================
   Migración: tipo de caso (CHAT / LLAMADA) + tiempos de respuesta
   Base de datos: CAC
   Ejecutar con un usuario administrador (sa / db_owner). Es idempotente:
   se puede correr más de una vez sin duplicar nada.
   ===================================================================== */

/* 0) RESPALDO (recomendado antes de migrar). Ajusta la ruta si hace falta.
BACKUP DATABASE CAC
TO DISK = N'C:\Program Files\Microsoft SQL Server\MSSQL17.MSSQLSERVER\MSSQL\Backup\CAC_antes_migracion_tipo_caso.bak'
WITH INIT, COMPRESSION;
*/

USE CAC;
GO

/* 1) Tipo de caso. Los casos existentes quedan como CHAT. */
IF COL_LENGTH('dbo.casos3cx', 'tipo') IS NULL
BEGIN
    ALTER TABLE dbo.casos3cx
        ADD tipo VARCHAR(10) NOT NULL
            CONSTRAINT DF_casos3cx_tipo DEFAULT 'CHAT';
END
GO

-- Va en un lote aparte: SQL Server no ve la columna nueva dentro del mismo lote
IF OBJECT_ID('dbo.CK_casos3cx_tipo', 'C') IS NULL
    ALTER TABLE dbo.casos3cx
        ADD CONSTRAINT CK_casos3cx_tipo CHECK (tipo IN ('CHAT', 'LLAMADA'));
GO

/* 2) Tramos de tiempo por caso.
      estado:
        ACTIVO     -> se está dando respuesta
        INACTIVO   -> el cliente no da respuesta
        EJECUCION  -> el analista está gestionando / ejecutando la solución
        FINALIZADO -> caso cerrado (estado final, no cuenta tiempo)
      fin IS NULL -> tramo en curso (solo puede haber uno por caso).
      El tramo FINALIZADO se guarda ya cerrado (inicio = fin). */
IF OBJECT_ID('dbo.casos3cx_estados', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.casos3cx_estados (
        id      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_casos3cx_estados PRIMARY KEY,
        idCaso  INT         NOT NULL CONSTRAINT FK_casos3cx_estados_caso REFERENCES dbo.casos3cx(id),
        estado  VARCHAR(12) NOT NULL
                CONSTRAINT CK_casos3cx_estados_estado
                CHECK (estado IN ('ACTIVO', 'INACTIVO', 'EJECUCION', 'FINALIZADO')),
        inicio  DATETIME    NOT NULL CONSTRAINT DF_casos3cx_estados_inicio DEFAULT GETDATE(),
        fin     DATETIME    NULL
    );

    CREATE INDEX IX_casos3cx_estados_caso ON dbo.casos3cx_estados (idCaso);

    -- Garantiza un único tramo abierto por caso (evita doble clic / carreras)
    CREATE UNIQUE INDEX UX_casos3cx_estados_abierto
        ON dbo.casos3cx_estados (idCaso) WHERE fin IS NULL;
END
GO

/* 3) Permisos para el usuario de la aplicación */
IF USER_ID('cac_app') IS NOT NULL
    GRANT SELECT, INSERT, UPDATE ON dbo.casos3cx_estados TO cac_app;
GO
