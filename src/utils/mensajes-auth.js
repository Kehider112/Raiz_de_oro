const traducciones = [
  ['Invalid login credentials', 'El correo o la contraseña no son correctos.'],
  ['Email not confirmed', 'Debes confirmar tu correo electrónico antes de iniciar sesión.'],
  ['User already registered', 'Ya existe una cuenta con este correo electrónico.'],
  ['Password should be at least 6 characters', 'La contraseña debe tener al menos 6 caracteres.'],
  ['New password should be different from the old password', 'La nueva contraseña debe ser diferente a la anterior.'],
]

export function traducirErrorAuth(error) {
  const mensaje = typeof error === 'string' ? error : error?.message
  if (!mensaje) return 'Ocurrió un error. Inténtalo de nuevo.'

  const traduccion = traducciones.find(([original]) => mensaje.includes(original))
  return traduccion ? traduccion[1] : mensaje
}
