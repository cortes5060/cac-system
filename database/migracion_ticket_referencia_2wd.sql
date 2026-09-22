/* =====================================================================
   Migración: vincular cada caso 3CX con su ticket de 2WorkDesk
   Base de datos: CAC
   Ejecutar con un usuario administrador (sa / db_owner). Es idempotente.
   Requiere haber corrido antes migracion_tipo_caso_y_estados.sql.

   El vínculo es "blando" (sin llave foránea): el analista puede registrar
   el número antes de que el ticket exista / se importe en la tabla tickets.
   El cruce se hace por casos3cx.ticketReferencia2WD = tickets.codigo2wd.
   ===================================================================== */

/* RESPALDO (recomendado). Ajusta la ruta si hace falta.
BACKUP DATABASE CAC
TO DISK = N'C:\Program Files\Microsoft SQL Server\MSSQL17.MSSQLSERVER\MSSQL\Backup\CAC_antes_ticket_2wd.bak'
WITH INIT, COMPRESSION;
*/

USE CAC;
GO

IF COL_LENGTH('dbo.casos3cx', 'ticketReferencia2WD') IS NULL
BEGIN
    ALTER TABLE dbo.casos3cx ADD ticketReferencia2WD NVARCHAR(50) NULL;
END
GO

-- Lote aparte: SQL Server no ve la columna nueva dentro del mismo lote.
-- Relación 1:1: un ticket de 2WD solo puede estar vinculado a UN caso (los casos sin ticket son varios y no chocan).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_casos3cx_ticketReferencia2WD'
                                            AND object_id = OBJECT_ID('dbo.casos3cx'))
    CREATE UNIQUE INDEX UX_casos3cx_ticketReferencia2WD
        ON dbo.casos3cx (ticketReferencia2WD)
        WHERE ticketReferencia2WD IS NOT NULL;
GO

/* Cierre automático: los casos que llevan más de 12 horas abiertos los finaliza el servidor.
   Esta marca permite distinguirlos de los que cerró el analista. */
IF COL_LENGTH('dbo.casos3cx_estados', 'automatico') IS NULL
BEGIN
    ALTER TABLE dbo.casos3cx_estados
        ADD automatico BIT NOT NULL CONSTRAINT DF_casos3cx_estados_automatico DEFAULT 0;
END
GO
