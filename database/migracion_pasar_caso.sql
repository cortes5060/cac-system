/* =====================================================================
   Migración: "Pasar caso" (un analista le asigna su caso abierto a otro)
   Base de datos: CAC
   Ejecutar con un usuario administrador (sa / db_owner). Es idempotente.
   Requiere haber corrido antes las dos migraciones anteriores.

   - casos3cx.idAnalista pasa a ser "quien tiene el caso ahora".
   - casos3cx_traspasos guarda el historial de cada traspaso.
   - casos3cx_estados.idAnalista indica de quién es cada tramo de tiempo,
     para que las métricas atribuyan a cada analista solo su propio tiempo.
   ===================================================================== */

/* RESPALDO (recomendado). Ajusta la ruta si hace falta.
BACKUP DATABASE CAC
TO DISK = N'C:\Program Files\Microsoft SQL Server\MSSQL17.MSSQLSERVER\MSSQL\Backup\CAC_antes_pasar_caso.bak'
WITH INIT, COMPRESSION;
*/

USE CAC;
GO

/* 1) Analista dueño de cada tramo de tiempo */
IF COL_LENGTH('dbo.casos3cx_estados', 'idAnalista') IS NULL
BEGIN
    ALTER TABLE dbo.casos3cx_estados ADD idAnalista INT NULL;
END
GO

-- Lote aparte: los tramos ya existentes pertenecen al analista del caso
UPDATE e
SET    e.idAnalista = c.idAnalista
FROM   dbo.casos3cx_estados e
JOIN   dbo.casos3cx c ON c.id = e.idCaso
WHERE  e.idAnalista IS NULL;
GO

/* 2) Historial de traspasos */
IF OBJECT_ID('dbo.casos3cx_traspasos', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.casos3cx_traspasos (
        id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_casos3cx_traspasos PRIMARY KEY,
        idCaso      INT      NOT NULL CONSTRAINT FK_casos3cx_traspasos_caso REFERENCES dbo.casos3cx(id),
        deAnalista  INT      NOT NULL,
        aAnalista   INT      NOT NULL,
        fecha       DATETIME NOT NULL CONSTRAINT DF_casos3cx_traspasos_fecha DEFAULT GETDATE()
    );

    CREATE INDEX IX_casos3cx_traspasos_caso ON dbo.casos3cx_traspasos (idCaso);
END
GO

/* 3) Permisos para el usuario de la aplicación */
IF USER_ID('cac_app') IS NOT NULL
BEGIN
    GRANT SELECT, INSERT ON dbo.casos3cx_traspasos TO cac_app;
    -- Necesario para vincular el ticket y para cambiar el analista al pasar un caso
    GRANT UPDATE ON dbo.casos3cx TO cac_app;
END
GO
