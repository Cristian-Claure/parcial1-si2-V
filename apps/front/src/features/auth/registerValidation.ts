/** Validación en línea del registro de cliente con mensajes en español (antes dependía de los globos del navegador). */
export type RegisterField = "firstName" | "lastName" | "email" | "password";

export function validateCustomerRegistration(values: Record<RegisterField, string>): Partial<Record<RegisterField, string>> {
  const errors: Partial<Record<RegisterField, string>> = {};
  if (!values.firstName.trim()) errors.firstName = "Escribe tu nombre.";
  if (!values.lastName.trim()) errors.lastName = "Escribe tu apellido.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) errors.email = "Escribe un correo válido, por ejemplo ana@correo.com.";
  if (values.password.length < 8 || !/[a-z]/.test(values.password) || !/[A-Z]/.test(values.password) || !/\d/.test(values.password)) errors.password = "Usa al menos 8 caracteres con mayúscula, minúscula y número.";
  return errors;
}
