export function onlyCpfDigits(value: string) {
  return String(value || "").replace(/\D/g, "");
}

export function isValidCpf(value: string) {
  const cpf = onlyCpfDigits(value);

  if (cpf.length !== 11) return false;
  return !/^(\d)\1{10}$/.test(cpf);
}
