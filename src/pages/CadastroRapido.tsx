import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Eye, EyeOff, Loader2, Search, UserPlus } from "lucide-react";
import { AvatarCapture } from "@/components/shared/AvatarCapture";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { publicRegisterMember, searchChurchesPublic, type ChurchSearchResult } from "@/services/saasService";
import { getFriendlyError } from "@/lib/error-map";
import { fetchAddressByCep, maskCep, onlyDigits } from "@/lib/cep";
import { formatPhoneBr } from "@/lib/br-format";
import { isValidCpf } from "@/lib/cpf";

function normalizeCpf(value: string) {
  return String(value || "").replace(/\D/g, "").slice(0, 11);
}

function maskCpf(value: string) {
  const d = normalizeCpf(value);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function normalizeSearch(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isEstadualOrSetorial(result: ChurchSearchResult) {
  const cls = normalizeSearch(result.class);
  return cls === "estadual" || cls === "setorial";
}

function churchClassLabel(result: ChurchSearchResult) {
  const cls = normalizeSearch(result.class);
  if (cls === "estadual") return "Estadual";
  if (cls === "setorial") return "Setorial";
  return result.class;
}

export default function CadastroRapido() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [totvs, setTotvs] = useState("");
  const [ministerRole, setMinisterRole] = useState("Membro");
  const [profession, setProfession] = useState("");
  const [baptismDate, setBaptismDate] = useState("");
  const [ordinationDate, setOrdinationDate] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [showConfirmarSenha, setShowConfirmarSenha] = useState(false);

  // Campo A: busca da estadual/setorial
  const [estadualSearch, setEstadualSearch] = useState("");
  const [selectedEstadual, setSelectedEstadual] = useState<{ totvs: string; nome: string } | null>(null);
  const [showEstadualSug, setShowEstadualSug] = useState(false);

  // Campo B: busca da igreja especifica no escopo
  const [igrejaSearch, setIgrejaSearch] = useState("");
  const [showIgrejaSug, setShowIgrejaSug] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [cep, setCep] = useState("");
  const [addressStreet, setAddressStreet] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [addressComplement, setAddressComplement] = useState("");
  const [addressNeighborhood, setAddressNeighborhood] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [cepLookupLoading, setCepLookupLoading] = useState(false);
  const [lastCepLookup, setLastCepLookup] = useState("");

  // Comentario: faz upload do avatar usando o CPF como nome do arquivo.
  // Path: avatars/users/{cpf}.{ext} — igual ao padrao do formulario de edicao de perfil.
  async function uploadAvatarPublico(file: File, cpfDigits: string) {
    if (!supabase) throw new Error("supabase_not_configured");

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `users/${cpfDigits}.${ext}`;

    const { error } = await supabase.storage.from("avatars").upload(path, file, {
      upsert: true,
      contentType: file.type || "image/jpeg",
      cacheControl: "3600",
    });
    if (error) throw error;

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    return data.publicUrl ? `${data.publicUrl}?t=${Date.now()}` : data.publicUrl;
  }

  // Resultados de busca vindos da edge function search-churches-public
  const [estadualResults, setEstadualResults] = useState<ChurchSearchResult[]>([]);
  const [igrejaResults, setIgrejaResults] = useState<ChurchSearchResult[]>([]);
  const [searchingEstadual, setSearchingEstadual] = useState(false);
  const [searchingIgreja, setSearchingIgreja] = useState(false);

  // Campo A: debounce de 300ms - busca estaduais e setoriais ao digitar 2+ caracteres
  useEffect(() => {
    const q = estadualSearch.trim();
    if (q.length < 2) {
      setEstadualResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingEstadual(true);
      try {
        const results = await searchChurchesPublic(q, 10);
        // Filtra somente estadual e setorial
        setEstadualResults(results.filter((r) => isEstadualOrSetorial(r)));
      } catch {
        setEstadualResults([]);
      } finally {
        setSearchingEstadual(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [estadualSearch]);

  // Campo B: debounce de 300ms - busca qualquer igreja ao digitar 2+ caracteres
  useEffect(() => {
    const q = igrejaSearch.trim();
    if (q.length < 2) {
      setIgrejaResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingIgreja(true);
      try {
        const results = await searchChurchesPublic(q, 10);
        setIgrejaResults(results);
      } catch {
        setIgrejaResults([]);
      } finally {
        setSearchingIgreja(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [igrejaSearch]);

  async function buscarCepAutomatico(force = false) {
    const cepDigits = onlyDigits(cep);
    if (cepDigits.length !== 8) return;
    if (!force && (cepLookupLoading || lastCepLookup === cepDigits)) return;

    setCepLookupLoading(true);
    try {
      const data = await fetchAddressByCep(cepDigits);
      setAddressStreet((prev) => prev || data.logradouro);
      setAddressNeighborhood((prev) => prev || data.bairro);
      setAddressCity((prev) => prev || data.localidade);
      setAddressState((prev) => prev || data.uf);
      setLastCepLookup(cepDigits);
    } catch (err) {
      if (force) {
        toast.error(String((err as Error)?.message || "") === "cep_not_found" ? "CEP não encontrado." : "Falha ao buscar CEP.");
      }
    } finally {
      setCepLookupLoading(false);
    }
  }

  useEffect(() => {
    const cepDigits = onlyDigits(cep);
    if (cepDigits.length !== 8) return;
    void buscarCepAutomatico();
  }, [cep]);

  async function submit() {
    const cpfRaw = normalizeCpf(cpf);
    if (!isValidCpf(cpfRaw)) {
      toast.error("Informe um CPF válido com 11 dígitos.");
      return;
    }
    if (!nome.trim()) {
      toast.error("Informe o nome completo.");
      return;
    }
    if (!totvs.trim()) {
      toast.error("Informe o TOTVS da igreja.");
      return;
    }
    if (!ministerRole.trim()) {
      toast.error("Selecione o cargo ministerial.");
      return;
    }
    if (senha.length < 6) {
      toast.error("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (senha !== confirmarSenha) {
      toast.error("As senhas não conferem.");
      return;
    }

    setLoading(true);
    try {
      // Comentario: faz upload da foto primeiro (se houver), depois registra com a URL
      let avatarUrl: string | null = null;
      if (avatarFile) {
        avatarUrl = await uploadAvatarPublico(avatarFile, cpfRaw);
      }

      await publicRegisterMember({
        cpf: cpfRaw,
        full_name: nome,
        minister_role: ministerRole,
        profession: profession || null,
        baptism_date: baptismDate || null,
        ordination_date: ordinationDate || null,
        phone: telefone || null,
        email: email || null,
        avatar_url: avatarUrl,
        cep: onlyDigits(cep) || null,
        address_street: addressStreet || null,
        address_number: addressNumber || null,
        address_complement: addressComplement || null,
        address_neighborhood: addressNeighborhood || null,
        address_city: addressCity || null,
        address_state: addressState || null,
        password: senha,
        totvs_id: totvs,
      });
      toast.success("Cadastro enviado. Aguarde liberação da secretaria/pastor.");
      nav("/");
    } catch (err) {
      toast.error(getFriendlyError(err, "workers"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f6f8fc] p-4 md:p-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <Button variant="outline" onClick={() => nav("/")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar para login
        </Button>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <UserPlus className="h-6 w-6 text-blue-600" /> Cadastro rápido de membro
            </CardTitle>
            <CardDescription>
              Preencha seus dados. Seu cadastro entra como pendente de liberação.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Foto 3x4 (opcional)</Label>
                {/* AvatarCapture: inclui botões de câmera/galeria, remoção de fundo por IA e preview 3x4 */}
                <AvatarCapture
                  onFileReady={(file) => setAvatarFile(file)}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Nome completo</Label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" />
              </div>

              <div className="space-y-2">
                <Label>CPF</Label>
                <Input value={maskCpf(cpf)} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" inputMode="numeric" />
              </div>

              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input
                  value={telefone}
                  onChange={(e) => setTelefone(formatPhoneBr(e.target.value))}
                  placeholder="(27) 99999-9999"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>E-mail (opcional)</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" />
              </div>

              <div className="space-y-2">
                <Label>Cargo ministerial</Label>
                <select
                  value={ministerRole}
                  onChange={(e) => setMinisterRole(e.target.value)}
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                >
                  <option value="Membro">Membro</option>
                  <option value="Obreiro">Obreiro/Cooperador</option>
                  <option value="Diácono">Diácono</option>
                  <option value="Presbítero">Presbítero</option>
                  <option value="Pastor">Pastor</option>
                </select>
                <p className="text-xs text-slate-500">Cadastro rápido cria usuário com role obreiro; este campo define apenas o cargo ministerial.</p>
              </div>

              <div className="space-y-2">
                <Label>Data de batismo</Label>
                <Input type="date" value={baptismDate} onChange={(e) => setBaptismDate(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Data de ordenacao</Label>
                <Input type="date" value={ordinationDate} onChange={(e) => setOrdinationDate(e.target.value)} />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Profissao</Label>
                <Input value={profession} onChange={(e) => setProfession(e.target.value)} placeholder="Profissao" />
              </div>

              <div className="space-y-2">
                <Label>CEP</Label>
                <Input
                  value={maskCep(cep)}
                  onChange={(e) => setCep(e.target.value)}
                  onBlur={() => void buscarCepAutomatico(true)}
                  placeholder="00000-000"
                />
                <p className="text-xs text-slate-500">{cepLookupLoading ? "Buscando endereco..." : "Endereco preenchido automaticamente pelo CEP."}</p>
              </div>

              <div className="space-y-2">
                <Label>Numero</Label>
                <Input value={addressNumber} onChange={(e) => setAddressNumber(e.target.value)} placeholder="Numero" />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Rua</Label>
                <Input value={addressStreet} onChange={(e) => setAddressStreet(e.target.value)} placeholder="Rua" />
              </div>

              <div className="space-y-2">
                <Label>Bairro</Label>
                <Input value={addressNeighborhood} onChange={(e) => setAddressNeighborhood(e.target.value)} placeholder="Bairro" />
              </div>

              <div className="space-y-2">
                <Label>Complemento</Label>
                <Input value={addressComplement} onChange={(e) => setAddressComplement(e.target.value)} placeholder="Complemento (opcional)" />
              </div>

              <div className="space-y-2">
                <Label>Cidade</Label>
                <Input value={addressCity} onChange={(e) => setAddressCity(e.target.value)} placeholder="Cidade" />
              </div>

              <div className="space-y-2">
                <Label>UF</Label>
                <Input value={addressState} onChange={(e) => setAddressState(e.target.value.toUpperCase().slice(0, 2))} placeholder="UF" />
              </div>

              {/* Campo A: Buscar estadual ou setorial com autocomplete via edge function */}
              <div className="space-y-2 md:col-span-2">
                <Label>Buscar igreja Estadual ou Setorial, por nome ou TOTVS</Label>
                <div className="relative">
                  {searchingEstadual ? (
                    <Loader2 className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
                  ) : (
                    <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  )}
                  <Input
                    value={estadualSearch}
                    onChange={(e) => {
                      setEstadualSearch(e.target.value);
                      setSelectedEstadual(null);
                      setTotvs("");
                      setIgrejaSearch("");
                      setShowEstadualSug(true);
                    }}
                    onFocus={() => setShowEstadualSug(true)}
                    onBlur={() => setTimeout(() => setShowEstadualSug(false), 150)}
                    placeholder="Ex.: 17250 ou Estadual de Vitoria"
                    className="pl-9"
                  />
                  {showEstadualSug && estadualResults.length > 0 && (
                    <div className="absolute z-50 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-56 overflow-y-auto">
                      {estadualResults.map((r) => (
                        <button
                          key={r.totvs_id}
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setSelectedEstadual({ totvs: r.totvs_id, nome: r.church_name });
                            setEstadualSearch(`${r.church_name} (${r.totvs_id})`);
                            setEstadualResults([]);
                            setShowEstadualSug(false);
                            setIgrejaSearch("");
                            setTotvs("");
                          }}
                        >
                          <span className="font-medium">{r.church_name}</span>
                          <span className="ml-auto text-xs text-slate-400">{r.totvs_id} · {churchClassLabel(r)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {selectedEstadual && (
                  <p className="text-xs text-emerald-600 font-medium">
                    Escopo selecionado: {selectedEstadual.nome} ({selectedEstadual.totvs})
                  </p>
                )}
                <p className="text-xs text-slate-500">Digite ao menos 2 caracteres para buscar.</p>
              </div>

              {/* Campo B: Selecionar a igreja especifica com autocomplete via edge function */}
              <div className="space-y-2 md:col-span-2">
                <Label>TOTVS da igreja (obrigatorio)</Label>
                <div className="relative">
                  {searchingIgreja ? (
                    <Loader2 className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
                  ) : (
                    <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  )}
                  <Input
                    value={igrejaSearch}
                    onChange={(e) => {
                      setIgrejaSearch(e.target.value);
                      setTotvs("");
                      setShowIgrejaSug(true);
                    }}
                    onFocus={() => setShowIgrejaSug(true)}
                    onBlur={() => {
                      setTimeout(() => setShowIgrejaSug(false), 150);
                      // Digitacao manual: se nao selecionou da lista, extrai digitos como TOTVS
                      if (!totvs) {
                        const digits = igrejaSearch.replace(/\D/g, "");
                        if (digits) setTotvs(digits);
                      }
                    }}
                    placeholder={selectedEstadual ? `Buscar no escopo de ${selectedEstadual.nome}` : "Digite o nome ou TOTVS da sua igreja"}
                    className="pl-9"
                  />
                  {showIgrejaSug && igrejaResults.length > 0 && (
                    <div className="absolute z-50 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-56 overflow-y-auto">
                      {igrejaResults.map((r) => (
                        <button
                          key={r.totvs_id}
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setIgrejaSearch(`${r.church_name} (${r.totvs_id})`);
                            setTotvs(r.totvs_id);
                            setIgrejaResults([]);
                            setShowIgrejaSug(false);
                          }}
                        >
                          <span className="font-medium">{r.church_name}</span>
                          <span className="ml-auto text-xs text-slate-400">{r.totvs_id}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {totvs && (
                  <p className="text-xs text-emerald-600 font-medium">Igreja selecionada: TOTVS {totvs}</p>
                )}
                <p className="text-xs text-slate-500">
                  {selectedEstadual
                    ? `Escopo: ${selectedEstadual.nome}. Digite ao menos 2 caracteres.`
                    : "Digite ao menos 2 caracteres para buscar qualquer igreja."}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Senha</Label>
                <div className="relative">
                  <Input
                    type={showSenha ? "text" : "password"}
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    placeholder="Minimo 6 caracteres"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500"
                    onClick={() => setShowSenha((prev) => !prev)}
                    aria-label={showSenha ? "Ocultar senha" : "Visualizar senha"}
                  >
                    {showSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Confirmar senha</Label>
                <div className="relative">
                  <Input
                    type={showConfirmarSenha ? "text" : "password"}
                    value={confirmarSenha}
                    onChange={(e) => setConfirmarSenha(e.target.value)}
                    placeholder="Repita a senha"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500"
                    onClick={() => setShowConfirmarSenha((prev) => !prev)}
                    aria-label={showConfirmarSenha ? "Ocultar senha" : "Visualizar senha"}
                  >
                    {showConfirmarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <Button className="w-full" onClick={submit} disabled={loading}>
              {loading ? "Enviando..." : "Enviar cadastro"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
