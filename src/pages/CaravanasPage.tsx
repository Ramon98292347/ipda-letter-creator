import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ManagementShell } from "@/components/layout/ManagementShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Bus, Check, Trash2, Loader2, Users, Map, Calendar } from "lucide-react";
import { toast } from "sonner";
import { useUser } from "@/context/UserContext";
import {
  listCaravanas,
  confirmCaravana,
  deleteCaravana,
  type CaravanaItem,
} from "@/services/saasService";

export default function CaravanasPage() {
  const { usuario } = useUser();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"todas" | "Recebida" | "Confirmada">("todas");
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const isAdmin = usuario?.role === "admin";

  const { data: caravanas = [], isLoading } = useQuery({
    queryKey: ["caravanas", filterStatus, searchTerm],
    queryFn: async () => {
      const result = await listCaravanas({
        status: filterStatus === "todas" ? undefined : filterStatus,
        search: searchTerm || undefined,
      });
      return result;
    },
    refetchInterval: 30000,
  });

  const recebidas = useMemo(() => {
    return caravanas.filter((c) => c.status === "Recebida");
  }, [caravanas]);

  const confirmadas = useMemo(() => {
    return caravanas.filter((c) => c.status === "Confirmada");
  }, [caravanas]);

  const totalPassageiros = useMemo(() => {
    return caravanas.reduce((sum, c) => sum + (c.passenger_count || 0), 0);
  }, [caravanas]);

  const handleConfirm = async (caravan: CaravanaItem) => {
    setLoadingId(caravan.id);
    try {
      const result = await confirmCaravana(caravan.id);
      if (result?.ok) {
        toast.success("Caravana confirmada!");
        queryClient.invalidateQueries({ queryKey: ["caravanas"] });
      } else {
        toast.error("Erro ao confirmar caravana");
      }
    } catch (error) {
      console.error(error);
      toast.error("Erro ao confirmar caravana");
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setLoadingId(id);
    try {
      const result = await deleteCaravana(id);
      if (result?.ok) {
        toast.success("Caravana deletada!");
        queryClient.invalidateQueries({ queryKey: ["caravanas"] });
      } else {
        toast.error("Erro ao deletar caravana");
      }
    } catch (error) {
      console.error(error);
      toast.error("Erro ao deletar caravana");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <ManagementShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Bus className="h-6 w-6 text-blue-600" />
              <h1 className="text-3xl font-bold text-slate-900">Caravanas</h1>
            </div>
            <p className="text-slate-600">
              {isAdmin
                ? "Gerencie todas as caravanas registradas"
                : "Veja as caravanas da sua jurisdição"}
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">
                Recebidas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">{recebidas.length}</div>
              <p className="text-xs text-slate-500 mt-1">aguardando confirmação</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">
                Confirmadas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{confirmadas.length}</div>
              <p className="text-xs text-slate-500 mt-1">prontas para viajar</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">
                Total de Passageiros
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">{totalPassageiros}</div>
              <p className="text-xs text-slate-500 mt-1">em todas as caravanas</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="search">Buscar</Label>
              <Input
                id="search"
                placeholder="Igreja, líder, pastor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  <SelectItem value="Recebida">Recebidas</SelectItem>
                  <SelectItem value="Confirmada">Confirmadas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </CardContent>
          </Card>
        ) : caravanas.length === 0 ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <div className="text-center">
                <Bus className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600">Nenhuma caravana registrada</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* Desktop View */}
            <div className="hidden md:block">
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        Igreja
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        Líder
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        Veículo
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        Passageiros
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        Status
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {caravanas.map((caravan, idx) => (
                      <tr
                        key={caravan.id}
                        className={`border-b ${
                          idx % 2 === 0 ? "bg-white" : "bg-slate-50"
                        } hover:bg-blue-50`}
                      >
                        <td className="px-4 py-3 text-sm">
                          <div className="font-medium text-slate-900">
                            {caravan.church_name}
                          </div>
                          {caravan.city_state && (
                            <div className="text-xs text-slate-500">{caravan.city_state}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-900">
                          {caravan.leader_name}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-900">
                          {caravan.vehicle_plate}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-900">
                          {caravan.passenger_count}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <Badge
                            variant={
                              caravan.status === "Confirmada" ? "default" : "secondary"
                            }
                            className={
                              caravan.status === "Confirmada"
                                ? "bg-green-100 text-green-800"
                                : "bg-amber-100 text-amber-800"
                            }
                          >
                            {caravan.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right space-x-2">
                          {caravan.status === "Recebida" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleConfirm(caravan)}
                              disabled={loadingId === caravan.id}
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            >
                              {loadingId === caravan.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <Check className="h-4 w-4 mr-1" />
                                  Confirmar
                                </>
                              )}
                            </Button>
                          )}
                          {isAdmin && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Deletar caravana?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Esta ação não pode ser desfeita.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDelete(caravan.id)}
                                    className="bg-red-600 hover:bg-red-700"
                                  >
                                    Deletar
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile View */}
            <div className="md:hidden space-y-3">
              {caravanas.map((caravan) => (
                <Card key={caravan.id} className="overflow-hidden">
                  <CardContent className="p-4 space-y-3">
                    <div>
                      <div className="font-semibold text-slate-900">
                        {caravan.church_name}
                      </div>
                      {caravan.city_state && (
                        <div className="text-sm text-slate-500">{caravan.city_state}</div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-slate-600">Líder</div>
                        <div className="font-medium text-slate-900">
                          {caravan.leader_name}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-600">Passageiros</div>
                        <div className="font-medium text-slate-900">
                          {caravan.passenger_count}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <Badge
                        className={
                          caravan.status === "Confirmada"
                            ? "bg-green-100 text-green-800"
                            : "bg-amber-100 text-amber-800"
                        }
                      >
                        {caravan.status}
                      </Badge>
                      <div className="space-x-2">
                        {caravan.status === "Recebida" && (
                          <Button
                            size="sm"
                            onClick={() => handleConfirm(caravan)}
                            disabled={loadingId === caravan.id}
                          >
                            {loadingId === caravan.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Confirmar"
                            )}
                          </Button>
                        )}
                        {isAdmin && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="destructive">
                                Deletar
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Deletar caravana?</AlertDialogTitle>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(caravan.id)}
                                  className="bg-red-600"
                                >
                                  Deletar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </ManagementShell>
  );
}
