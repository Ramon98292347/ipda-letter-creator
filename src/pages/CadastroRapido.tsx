import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchChurches } from "@/services/churchService";
import { publicRegisterMember } from "@/services/saasService";
import { getFriendlyError } from "@/lib/error-map";

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

export default function CadastroRapido() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [totvs, setTotvs] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [filtroIgreja, setFiltroIgreja] = useState("");

  const { data: churches = [] } = useQuery({
    queryKey: ["public-register-churches"],
    queryFn: fetchChurches,
    staleTime: 60_000,
  });

  const sugestoes = useMemo(() => {
    const q = normalizeSearch(filtroIgreja || totvs);
    if (!q) return churches.slice(0, 30);

    return churches
      .filter((c) => normalizeSearch(`${c.codigoTotvs} ${c.nome}`).includes(q))
      .slice(0, 30);
  }, [churches, filtroIgreja, totvs]);

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
      await publicRegisterMember({
        cpf: cpfRaw,
        full_name: nome,
        phone: telefone || null,
        email: email || null,
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
                <Label>Nome completo</Label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" />
              </div>

              <div className="space-y-2">
                <Label>CPF</Label>
                <Input value={maskCpf(cpf)} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" inputMode="numeric" />
              </div>

              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(27) 99999-9999" />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>E-mail (opcional)</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Buscar igreja por nome ou TOTVS</Label>
                <Input
                  value={filtroIgreja}
                  onChange={(e) => setFiltroIgreja(e.target.value)}
                  placeholder="Ex.: 17250 ou Estadual de Vitoria"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>TOTVS da igreja (obrigatorio)</Label>
                <Input
                  value={totvs}
                  onChange={(e) => setTotvs(e.target.value.replace(/\D/g, ""))}
                  placeholder="Digite ou selecione abaixo"
                />
                {sugestoes.length > 0 ? (
                  <div className="max-h-40 overflow-y-auto rounded-md border border-slate-200">
                    {sugestoes.map((church) => (
                      <button
                        key={`${church.codigoTotvs}-${church.nome}`}
                        type="button"
                        onClick={() => {
                          setTotvs(church.codigoTotvs);
                          setFiltroIgreja(church.nome);
                        }}
                        className="block w-full border-b px-3 py-2 text-left text-sm hover:bg-slate-50"
                      >
                        {church.codigoTotvs} - {church.nome}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Nenhuma igreja encontrada para esse filtro.</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Senha</Label>
                <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Minimo 6 caracteres" />
              </div>

              <div className="space-y-2">
                <Label>Confirmar senha</Label>
                <Input type="password" value={confirmarSenha} onChange={(e) => setConfirmarSenha(e.target.value)} placeholder="Repita a senha" />
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
