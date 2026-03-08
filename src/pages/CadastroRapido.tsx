import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Eye, EyeOff, Search, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { fetchChurches } from "@/services/churchService";
import { publicRegisterMember } from "@/services/saasService";
import { getFriendlyError } from "@/lib/error-map";
import { fetchAddressByCep, maskCep, onlyDigits } from "@/lib/cep";
import { formatPhoneBr } from "@/lib/br-format";

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

function normalizeChurchClass(value: unknown) {
  return normalizeSearch(String(value || ""));
}

function isEstadualOrSetorial(church: { classificacao?: string | null }) {
  const cls = normalizeChurchClass(church.classificacao);
  return cls === "estadual" || cls === "setorial";
}

function churchClassLabel(church: { classificacao?: string | null }) {
  const cls = normalizeChurchClass(church.classificacao);
  if (cls === "estadual") return "Estadual";
  if (cls === "setorial") return "Setorial";
  return "—";
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
  const [filtroIgreja, setFiltroIgreja] = useState("");
  const [igrejaEncontradaNome, setIgrejaEncontradaNome] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [cep, setCep] = useState("");
  const [addressStreet, setAddressStreet] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [addressComplement, setAddressComplement] = useState("");
  const [addressNeighborhood, setAddressNeighborhood] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [cepLookupLoading, setCepLookupLoading] = useState(false);
  const [lastCepLookup, setLastCepLookup] = useState("");

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewUrl("");
      return;
    }
    const objectUrl = URL.createObjectURL(avatarFile);
    setAvatarPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [avatarFile]);

  async function uploadAvatarPublico(file: File, cpfDigits: string) {
    if (!supabase) throw new Error("supabase_not_configured");

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `users/cadastro-${cpfDigits}-${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from("avatars").upload(path, file, {
      upsert: true,
      contentType: file.type || "image/jpeg",
      cacheControl: "3600",
    });
    if (error) throw error;

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    return data.publicUrl ? `${data.publicUrl}?t=${Date.now()}` : data.publicUrl;
  }

  const { data: churches = [] } = useQuery({
    queryKey: ["public-register-churches"],
    queryFn: fetchChurches,
    staleTime: 60_000,
  });

  const buscaNormalizada = useMemo(() => normalizeSearch(filtroIgreja), [filtroIgreja]);

  function buscarIgreja() {
    const texto = buscaNormalizada;
    if (!texto) {
      toast.error("Digite nome ou TOTVS para buscar a igreja.");
      return;
    }

    const textoNumerico = texto.replace(/\D/g, "");
    const churchesPermitidas = churches.filter((c) => isEstadualOrSetorial(c));
    const exataPorTotvs = churchesPermitidas.find((c) => String(c.codigoTotvs) === textoNumerico);
    if (exataPorTotvs) {
      setTotvs(exataPorTotvs.codigoTotvs);
      setIgrejaEncontradaNome(`${exataPorTotvs.nome} (${churchClassLabel(exataPorTotvs)})`);
      toast.success("Igreja encontrada.");
      return;
    }

    const porNomeOuPrefixo = churchesPermitidas.find((c) => {
      const nomeNormalizado = normalizeSearch(c.nome);
      const totvsTexto = String(c.codigoTotvs || "");
      return nomeNormalizado.includes(texto) || totvsTexto.startsWith(textoNumerico);
    });

    if (porNomeOuPrefixo) {
      setTotvs(porNomeOuPrefixo.codigoTotvs);
      setIgrejaEncontradaNome(`${porNomeOuPrefixo.nome} (${churchClassLabel(porNomeOuPrefixo)})`);
      toast.success("Igreja encontrada.");
      return;
    }

    setTotvs("");
    setIgrejaEncontradaNome("");
    toast.error("Igreja nao encontrada. Use apenas igrejas Estadual ou Setorial.");
  }

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
        toast.error(String((err as Error)?.message || "") === "cep_not_found" ? "CEP nao encontrado." : "Falha ao buscar CEP.");
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
    if (cpfRaw.length !== 11) {
      toast.error("Informe um CPF valido com 11 digitos.");
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
      toast.error("As senhas nao conferem.");
      return;
    }

    setLoading(true);
    try {
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
      toast.success("Cadastro enviado. Aguarde liberacao da secretaria/pastor.");
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
              <UserPlus className="h-6 w-6 text-blue-600" /> Cadastro rapido de membro
            </CardTitle>
            <CardDescription>
              Preencha seus dados. Seu cadastro entra como pendente de liberacao.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Foto para avatar (opcional)</Label>
                <div className="flex flex-col gap-3 md:flex-row md:items-start">
                  <div className="w-full md:flex-1">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        setAvatarFile(file);
                      }}
                    />
                    {avatarFile ? <p className="mt-1 text-xs text-slate-600">Arquivo: {avatarFile.name}</p> : null}
                  </div>

                  <div className="flex flex-col items-center">
                    <div className="h-[160px] w-[120px] overflow-hidden rounded-md border border-slate-300 bg-slate-50">
                      {avatarPreviewUrl ? (
                        <img src={avatarPreviewUrl} alt="Pre-visualizacao 3x4" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-center text-xs text-slate-500">
                          Pre-visualizacao 3x4
                        </div>
                      )}
                    </div>
                    <span className="mt-1 text-[11px] text-slate-500">Tamanho 3x4</span>
                  </div>
                </div>
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
                  <option value="Diacono">Diacono</option>
                  <option value="Presbitero">Presbitero</option>
                  <option value="Pastor">Pastor</option>
                </select>
                <p className="text-xs text-slate-500">Cadastro rapido cria usuario com role obreiro; este campo define apenas o cargo ministerial.</p>
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

              <div className="space-y-2 md:col-span-2">
                <Label>Buscar igreja Estadual ou Setorial, por nome ou TOTVS</Label>
                <div className="flex gap-2">
                  <Input
                    value={filtroIgreja}
                    onChange={(e) => {
                      setFiltroIgreja(e.target.value);
                      setTotvs("");
                      setIgrejaEncontradaNome("");
                    }}
                    placeholder="Ex.: 17250 ou Estadual de Vitoria"
                  />
                  <Button type="button" variant="outline" onClick={buscarIgreja}>
                    <Search className="mr-2 h-4 w-4" />
                    Buscar
                  </Button>
                </div>
                {igrejaEncontradaNome ? (
                  <p className="text-xs text-slate-600">
                    Igreja selecionada: <span className="font-medium">{igrejaEncontradaNome}</span>
                  </p>
                ) : null}
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>TOTVS da igreja (obrigatorio)</Label>
                <Input
                  value={totvs}
                  readOnly
                  placeholder="Digite ou selecione abaixo"
                />
                <p className="text-xs text-slate-500">Campo preenchido automaticamente pela busca.</p>
                <p className="text-xs text-slate-500">Somente igrejas Estadual ou Setorial podem ser selecionadas aqui.</p>
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
