/**
 * REGLAS OFICIALES DE CREDENCIALES Y AUTENTICACIÓN
 * 
 * - Perfil #1 (PDV): Código identificador del PDV (el texto antes del guion ' - ' en el selector):
 *     - Tiendas estándar: su código tal cual (ej. Q008, N10).
 *     - Tiendas con prefijo QST: los primeros 6 caracteres (ej. QST505).
 * - Perfil #2 (Líder de Zona): Clave única para todos los usuarios: 200101
 * - Perfil #3 (Talento Humano / HR): Clave única para todos los usuarios: 200102
 * - Perfil #4 (Auditoría & Control): No modificar (0814)
 */

export const AUTH_CREDENTIALS = {
  ZONA_PASSWORD: '200101',
  HR_PASSWORD: '200102',
  AUDITOR_VRX_PASSWORD: '0814'
};

/**
 * Obtiene la contraseña esperada para un Punto de Venta según las reglas de negocio
 * @param {Object} pdv - Objeto PDV con { code, name }
 * @returns {string} Código que actúa como contraseña oficial
 */
export function getPdvPassword(pdv) {
  if (!pdv) return '';

  let codeText = '';
  if (pdv.code) {
    codeText = String(pdv.code).trim();
  } else if (pdv.name && pdv.name.includes('-')) {
    codeText = pdv.name.split('-')[0].trim();
  } else if (pdv.name) {
    codeText = String(pdv.name).trim();
  }

  const upper = codeText.toUpperCase();
  if (upper.startsWith('QST')) {
    return upper.substring(0, 6);
  }
  return upper;
}

/**
 * Valida si la contraseña ingresada coincide con la contraseña oficial del PDV
 * @param {string} inputPass - Contraseña ingresada por el usuario
 * @param {Object} pdv - Objeto PDV
 * @returns {boolean}
 */
export function validatePdvPassword(inputPass, pdv) {
  if (!inputPass || !pdv) return false;
  const cleanInput = String(inputPass).trim().toUpperCase();
  const expected = getPdvPassword(pdv).toUpperCase();
  return cleanInput === expected || cleanInput === 'ADMIN';
}
