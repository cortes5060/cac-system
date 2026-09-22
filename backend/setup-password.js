// Uso: node setup-password.js <contraseña> [coordinador|supervisor]
// Omitir el segundo argumento genera SQL para ambos roles.

const bcrypt = require('bcryptjs');

const password = process.argv[2];
const rol      = (process.argv[3] || '').toLowerCase();

if (!password) {
  console.log('\nUso: node setup-password.js <contraseña> [coordinador|supervisor]');
  console.log('Ejemplo (coordinador): node setup-password.js MiClave2025 coordinador');
  console.log('Ejemplo (supervisor):  node setup-password.js MiClave2025 supervisor');
  console.log('Ejemplo (ambos):       node setup-password.js MiClave2025\n');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 10);
console.log('\n✓ Hash generado exitosamente\n');
console.log('Copia y ejecuta en SQL Server Management Studio:\n');

if (!rol || rol === 'coordinador') {
  console.log('─'.repeat(62));
  console.log('-- Coordinador (idRol = 2):');
  console.log(`UPDATE analistas SET passwordHash = '${hash}' WHERE idRol = 2;`);
  console.log('─'.repeat(62));
}

if (!rol || rol === 'supervisor') {
  console.log('─'.repeat(62));
  console.log('-- Supervisor (idRol = 3):');
  console.log(`UPDATE analistas SET passwordHash = '${hash}' WHERE idRol = 3;`);
  console.log('─'.repeat(62));
}

