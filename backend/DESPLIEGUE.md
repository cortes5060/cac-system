# Despliegue del backend CAC INSEPET

## Qué trae este .zip
- `src/` — todo el código del servidor (rutas, controladores, configuración).
- `package.json` y `package-lock.json` — lista exacta de librerías a instalar.
- `.env.example` — plantilla de configuración. **No trae contraseñas reales.**
- `setup-password.js` — utilidad para generar el hash de contraseña de coordinador/supervisor.

No trae: `node_modules` (se instala en el servidor), `.env` real (tiene credenciales, se crea a mano en el servidor), ni la base de datos (la envías aparte en el `.bak`).

## Qué hay que instalar en el servidor

1. **Node.js 20 o superior** (aquí se usó la v24). Descarga: https://nodejs.org — instalar la versión LTS.
   No se necesita Python, Visual Studio Build Tools, ni ningún compilador: todas las librerías del proyecto son JavaScript puro, incluida la conexión a SQL Server (`mssql`/`tedious` habla el protocolo TDS directamente, sin drivers ODBC).

2. **SQL Server** con la base `CAC` restaurada desde el `.bak` que envías aparte. Debe quedar accesible desde el servidor donde corra este backend (mismo servidor o por red).

3. Un usuario de SQL Server con permisos sobre la base `CAC` (el mismo tipo de usuario `cac_app` que se usa hoy: `SELECT`/`INSERT`/`UPDATE` sobre las tablas de la app). Si el `.bak` ya incluye ese login, revisar que el "Server Login" quede re-mapeado al usuario de la base tras restaurar (`ALTER USER cac_app WITH LOGIN = cac_app;` si hace falta).

## Pasos en el servidor

```bash
# 1. Descomprimir el zip en la carpeta donde vivirá el backend, por ejemplo:
#    C:\CAC\backend  (Windows)  o  /opt/cac/backend  (Linux)

cd backend

# 2. Instalar las librerías (usa package-lock.json, deja todo en las mismas versiones probadas aquí)
npm ci

# 3. Crear el archivo de configuración real a partir de la plantilla
copy .env.example .env      # Windows
# cp .env.example .env      # Linux/Mac

# 4. Editar .env con los datos reales del servidor (ver abajo qué va en cada línea)

# 5. Arrancar
npm start
```

## Qué completar en `.env`

```
DB_USER=cac_app
DB_PASSWORD=<la contraseña real de ese usuario en el servidor>
DB_SERVER=<localhost, o la IP/nombre del servidor de SQL Server>
DB_NAME=CAC
DB_PORT=1433

PORT=3000

# Solo si van a usar la IA de ticket.controller/ia.controller:
ANTHROPIC_API_KEY=<clave real, o dejar vacío si no se usa esa función>

# Solo si van a usar "Enviar informe" por correo:
MAIL_PROVIDER=gmail          # o "office365"
MAIL_USER=<correo remitente>
MAIL_PASS=<contraseña de aplicación, no la contraseña normal>
```

## Que quede corriendo siempre (recomendado)

Node por sí solo se cierra si cierras la consola. Para producción, instalar PM2:

```bash
npm install -g pm2
pm2 start src/server.js --name cac-backend
pm2 save
pm2 startup     # deja instrucciones para que arranque solo con el servidor
```

## Después de levantarlo

- Verificar que responde: `http://<ip-del-servidor>:3000/health` debe devolver `{"ok":true,...}`.
- Abrir el puerto 3000 en el firewall del servidor si otras máquinas (los Electron de los analistas) se van a conectar por red.
- En cada equipo con la app de Electron, actualizar `electron/config.js` con la IP real del servidor (`const API = "http://<ip-del-servidor>:3000";`).
