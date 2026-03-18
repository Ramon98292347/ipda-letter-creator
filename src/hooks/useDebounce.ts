import { useEffect, useState } from "react";

// Hook que atrasa a atualizacao de um valor por N milissegundos.
// Evita chamadas excessivas a API enquanto o usuario digita.
// Exemplo: const debouncedNome = useDebounce(filterNome, 400);
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    // Comentario: cancela o timer anterior ao receber um novo valor,
    // garantindo que apenas o ultimo valor (apos parar de digitar) dispara a query.
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
