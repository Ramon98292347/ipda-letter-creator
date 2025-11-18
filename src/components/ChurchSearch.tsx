import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, MapPin, Search } from "lucide-react";
import { cn } from "@/lib/utils";

// TODO: Replace with Supabase integration later
export interface Church {
  id: number;
  codigoTotvs: string;
  nome: string;
  cidade: string;
  uf: string;
  carimboIgreja: string;
  carimboPastor: string;
  classificacao?: string;
}

interface ChurchSearchProps {
  label: string;
  placeholder: string;
  onSelect: (church: Church) => void;
  churches: Church[];
  value?: string;
  inputId?: string;
  disabled?: boolean;
  onDisabledClickMessage?: string;
}

import { toast } from "sonner";

export function ChurchSearch({ label, placeholder, onSelect, churches, value, inputId, disabled, onDisabledClickMessage }: ChurchSearchProps) {
  const [searchTerm, setSearchTerm] = useState(value || "");
  const [isOpen, setIsOpen] = useState(false);
  const [filteredChurches, setFilteredChurches] = useState<Church[]>([]);
  const [highlightIndex, setHighlightIndex] = useState<number>(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const norm = useMemo(() => (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(), []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      const q = norm(searchTerm).trim();
      if (q.length >= 1) {
        const tokens = q.split(/\s+/).filter(Boolean);
        const isDigits = (s: string) => /^\d+$/.test(s);
        const scored = churches
          .map((church) => {
            const code = norm(church.codigoTotvs ?? "");
            const combined = norm(`${church.nome ?? ""}`);
            const nameTokens = combined.split(/\s+/).filter(Boolean);
            const matchesAll = tokens.every((tk) => (isDigits(tk) ? code.startsWith(tk) : combined.includes(tk)));
            if (!matchesAll) return null as unknown as { item: typeof church; score: number };
            let score = 0;
            tokens.forEach((tk) => {
              if (isDigits(tk)) {
                if (code.startsWith(tk)) score += 3;
              } else if (nameTokens.some((nt) => nt.startsWith(tk))) {
                score += 2;
              } else if (combined.includes(tk)) {
                score += 1;
              }
            });
            return { item: church, score };
          })
          .filter(Boolean) as { item: Church; score: number }[];
        const filtered = scored.sort((a, b) => b.score - a.score).map((s) => s.item);
        setFilteredChurches(filtered);
        setIsOpen(filtered.length > 0);
        setHighlightIndex(filtered.length ? 0 : -1);
      } else {
        setFilteredChurches([]);
        setIsOpen(false);
        setHighlightIndex(-1);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm, churches, norm]);

  useEffect(() => {
    setSearchTerm(value || "");
    if (!value) {
      setIsOpen(false);
      setHighlightIndex(-1);
    }
  }, [value]);

  const handleSelect = (church: Church) => {
    setSearchTerm(`${church.codigoTotvs} - ${church.nome}`);
    onSelect(church);
    setIsOpen(false);
    setHighlightIndex(-1);
  };

  return (
    <div
      ref={wrapperRef}
      className="relative space-y-2"
      onClick={() => {
        if (disabled && onDisabledClickMessage) {
          toast.info(onDisabledClickMessage);
        }
      }}
    >
      <Label htmlFor={inputId} className="text-sm font-medium text-foreground">
        {label}
      </Label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          id={inputId}
          type="text"
          placeholder={placeholder}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={() => {
            if (disabled) return;
            if (filteredChurches.length > 0) setIsOpen(true);
          }}
          onKeyDown={(e) => {
            if (disabled) return;
            if (!isOpen) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlightIndex((i) => (i + 1 < filteredChurches.length ? i + 1 : i));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlightIndex((i) => (i - 1 >= 0 ? i - 1 : i));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (highlightIndex >= 0) handleSelect(filteredChurches[highlightIndex]);
            } else if (e.key === "Escape") {
              setIsOpen(false);
            }
          }}
          disabled={disabled}
          className="pl-9 bg-card border-input focus:border-primary focus:ring-primary transition-colors"
        />
      </div>

      {isOpen && filteredChurches.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-lg shadow-lg max-h-64 overflow-auto" role="listbox" aria-labelledby={inputId}>
          {filteredChurches.map((church, idx) => (
            <button
              key={church.id}
              onClick={() => handleSelect(church)}
              className={cn(
                "w-full px-4 py-3 text-left hover:bg-secondary/50 transition-colors flex flex-col gap-1 border-b border-border last:border-b-0",
                idx === highlightIndex && "bg-secondary/50",
              )}
              role="option"
            >
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary shrink-0" />
                <span className="font-semibold text-sm text-primary">{church.codigoTotvs}</span>
                <span className="text-sm text-foreground">{church.nome}</span>
              </div>
              <div className="flex items-center gap-1 ml-6">
                <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground">
                  {church.cidade} - {church.uf}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
