/**
 * FinanceiroConfigPage.tsx
 * =========================
 * O que faz: Página de configurações do módulo financeiro.
 *            Permite ao financeiro ajustar preferências do sistema:
 *            perfil, notificações, segurança (timeout de sessão) e dados.
 *
 * Quem acessa: Usuários com role "financeiro"
 * Layout: ManagementShell do sistema principal
 *
 * Adaptado do financeiro-novo/src/pages/Configuracoes.tsx.
 * Removido: import Layout, import AuthContext.
 * Substituído: useAuth() → useUser() do contexto principal.
 */

import React, { useEffect, useState } from 'react';
import { ManagementShell } from "@/components/layout/ManagementShell";
import { Settings, User, Bell, Shield, Palette, Database } from 'lucide-react';
import { useUser } from '@/context/UserContext';
import { toast } from '@/components/ui/use-toast';

export default function FinanceiroConfigPage() {
  // Obtém o usuário logado do contexto principal do sistema
  const { usuario } = useUser();

  const [activeTab, setActiveTab] = useState('profile');

  // Dados do perfil — preenchidos com os dados do usuário logado
  const [profileData, setProfileData] = useState({
    name: usuario?.nome || usuario?.full_name || '',
    email: usuario?.email || '',
    phone: usuario?.telefone || '',
    company: usuario?.church_name || ''
  });

  // Preferências de notificação
  const [notifications, setNotifications] = useState({
    email: true,
    push: false,
    reports: true,
    alerts: true
  });

  // Configurações de segurança — lidas do localStorage
  const [security, setSecurity] = useState(() => {
    const sessionTimeoutRaw = localStorage.getItem('sessionTimeoutMinutes');
    const passwordExpiryRaw = localStorage.getItem('passwordExpiryDays');
    const twoFactorRaw = localStorage.getItem('twoFactorEnabled');

    return {
      twoFactor: twoFactorRaw === 'true',
      sessionTimeout: sessionTimeoutRaw ? parseInt(sessionTimeoutRaw, 10) || 30 : 30,
      passwordExpiry: passwordExpiryRaw ? parseInt(passwordExpiryRaw, 10) || 90 : 90
    };
  });

  /** Valida se um e-mail tem formato válido */
  const isValidEmail = (value: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  };

  // Abas disponíveis na barra lateral de configurações
  const tabs = [
    { id: 'profile', label: 'Perfil', icon: User },
    { id: 'notifications', label: 'Notificações', icon: Bell },
    { id: 'security', label: 'Segurança', icon: Shield },
    { id: 'appearance', label: 'Aparência', icon: Palette },
    { id: 'data', label: 'Dados', icon: Database },
  ];

  /** Valida e simula salvamento do perfil */
  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileData.name.trim() || !profileData.email.trim()) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Nome e e-mail são obrigatórios.',
        variant: 'destructive'
      });
      return;
    }
    if (!isValidEmail(profileData.email)) {
      toast({
        title: 'E-mail inválido',
        description: 'Informe um e-mail válido para continuar.',
        variant: 'destructive'
      });
      return;
    }
    toast({
      title: 'Perfil atualizado',
      description: 'Seu perfil foi atualizado com sucesso.'
    });
  };

  const handleNotificationChange = (key: string, value: boolean) => {
    setNotifications(prev => ({ ...prev, [key]: value }));
  };

  const handleSecurityChange = (key: string, value: any) => {
    setSecurity(prev => ({ ...prev, [key]: value }));
  };

  // Persiste as configurações de segurança no localStorage quando mudam
  useEffect(() => {
    localStorage.setItem('sessionTimeoutMinutes', security.sessionTimeout.toString());
    localStorage.setItem('passwordExpiryDays', security.passwordExpiry.toString());
    localStorage.setItem('twoFactorEnabled', security.twoFactor ? 'true' : 'false');
  }, [security]);

  const exportData = () => {
    toast({
      title: 'Dados exportados',
      description: 'Os dados foram exportados com sucesso.'
    });
  };

  const importData = () => {
    toast({
      title: 'Em desenvolvimento',
      description: 'A importação de dados será implementada em breve.'
    });
  };

  /**
   * Renderiza o conteúdo da aba selecionada.
   */
  const renderTabContent = () => {
    switch (activeTab) {

      // Aba: Perfil do usuário
      case 'profile':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Informações Pessoais</h3>
              <form onSubmit={handleProfileSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nome Completo
                    </label>
                    <input
                      type="text"
                      value={profileData.name}
                      onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      E-mail
                    </label>
                    <input
                      type="email"
                      value={profileData.email}
                      onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Telefone
                    </label>
                    <input
                      type="tel"
                      value={profileData.phone}
                      onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none transition-colors"
                      placeholder="(11) 99999-9999"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Igreja
                    </label>
                    <input
                      type="text"
                      value={profileData.company}
                      onChange={(e) => setProfileData({ ...profileData, company: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none transition-colors"
                      placeholder="Nome da igreja"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="px-6 py-2 bg-[#1A237E] text-white rounded-lg hover:bg-[#0D47A1] transition-colors"
                >
                  Salvar Alterações
                </button>
              </form>
            </div>
          </div>
        );

      // Aba: Notificações
      case 'notifications':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Preferências de Notificação</h3>
              <div className="space-y-4">
                {[
                  { key: 'email', label: 'Notificações por E-mail', desc: 'Receber notificações por e-mail' },
                  { key: 'push', label: 'Notificações Push', desc: 'Receber notificações push no navegador' },
                  { key: 'reports', label: 'Relatórios Automáticos', desc: 'Receber relatórios mensais por e-mail' },
                  { key: 'alerts', label: 'Alertas de Segurança', desc: 'Receber alertas sobre atividades suspeitas' },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <h4 className="font-medium text-gray-900">{label}</h4>
                      <p className="text-sm text-gray-600">{desc}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notifications[key as keyof typeof notifications]}
                        onChange={(e) => handleNotificationChange(key, e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1A237E]"></div>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      // Aba: Segurança
      case 'security':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Configurações de Segurança</h3>
              <div className="space-y-4">
                {/* Toggle: Autenticação de Dois Fatores */}
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-gray-900">Autenticação de Dois Fatores</h4>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={security.twoFactor}
                        onChange={(e) => handleSecurityChange('twoFactor', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1A237E]"></div>
                    </label>
                  </div>
                  <p className="text-sm text-gray-600">Ativar verificação em duas etapas para maior segurança</p>
                </div>

                {/* Seletor: Timeout de Sessão */}
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-2">Timeout de Sessão</h4>
                  <div className="flex items-center space-x-4">
                    <select
                      value={security.sessionTimeout}
                      onChange={(e) => handleSecurityChange('sessionTimeout', parseInt(e.target.value))}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none transition-colors"
                    >
                      <option value={15}>15 minutos</option>
                      <option value={30}>30 minutos</option>
                      <option value={60}>1 hora</option>
                      <option value={120}>2 horas</option>
                    </select>
                    <span className="text-sm text-gray-600">de inatividade</span>
                  </div>
                </div>

                <button className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors">
                  Alterar Senha
                </button>
              </div>
            </div>
          </div>
        );

      // Aba: Aparência
      case 'appearance':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Personalização</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-4">Tema</h4>
                  <div className="space-y-2">
                    <label className="flex items-center">
                      <input type="radio" name="theme" value="light" defaultChecked className="mr-2 text-[#1A237E]" />
                      <span>Tema Claro</span>
                    </label>
                    <label className="flex items-center">
                      <input type="radio" name="theme" value="dark" className="mr-2 text-[#1A237E]" />
                      <span>Tema Escuro</span>
                    </label>
                    <label className="flex items-center">
                      <input type="radio" name="theme" value="auto" className="mr-2 text-[#1A237E]" />
                      <span>Automático</span>
                    </label>
                  </div>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-4">Cor Principal</h4>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="w-8 h-8 bg-[#1A237E] rounded cursor-pointer border-2 border-gray-300"></div>
                    <div className="w-8 h-8 bg-blue-600 rounded cursor-pointer border-2 border-transparent hover:border-gray-300"></div>
                    <div className="w-8 h-8 bg-green-600 rounded cursor-pointer border-2 border-transparent hover:border-gray-300"></div>
                    <div className="w-8 h-8 bg-purple-600 rounded cursor-pointer border-2 border-transparent hover:border-gray-300"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      // Aba: Gerenciamento de Dados
      case 'data':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Gerenciamento de Dados</h3>
              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-2">Exportar Dados</h4>
                  <p className="text-sm text-gray-600 mb-4">
                    Baixe os dados financeiros em formato JSON
                  </p>
                  <button
                    onClick={exportData}
                    className="px-4 py-2 bg-[#1A237E] text-white rounded-lg hover:bg-[#0D47A1] transition-colors"
                  >
                    Exportar Dados
                  </button>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-2">Importar Dados</h4>
                  <p className="text-sm text-gray-600 mb-4">
                    Importe dados de outros sistemas ou backups
                  </p>
                  <button
                    onClick={importData}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Importar Dados
                  </button>
                </div>

                {/* Zona de perigo: limpar dados locais */}
                <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                  <h4 className="font-medium text-red-900 mb-2">Limpar Dados Locais</h4>
                  <p className="text-sm text-red-700 mb-4">
                    Remove apenas os dados do cache local (contagens e entradas salvas).
                    Os dados do servidor não serão afetados.
                  </p>
                  <button
                    onClick={() => {
                      if (window.confirm('Tem certeza que deseja limpar os dados locais? As contagens salvas serão removidas.')) {
                        // Remove apenas as chaves do módulo financeiro
                        localStorage.removeItem('entradasSalvas');
                        localStorage.removeItem('registrosDiarios');
                        localStorage.removeItem('monthlySheet');
                        localStorage.removeItem('transferenciaMesAnterior');
                        window.location.reload();
                      }
                    }}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Limpar Dados Locais
                  </button>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <ManagementShell roleMode="financeiro">
      <div className="space-y-6">
        {/* Cabeçalho */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <Settings className="w-6 h-6 mr-2 text-[#1A237E]" />
            Configurações
          </h1>
          <p className="text-gray-600">Gerencie suas preferências e configurações do módulo financeiro</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Barra lateral de navegação das abas */}
          <div className="lg:w-64 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <nav className="space-y-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center space-x-3 px-3 py-2 text-left rounded-lg transition-colors ${
                      activeTab === tab.id
                        ? 'bg-[#1A237E] text-white'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Conteúdo da aba selecionada */}
          <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            {renderTabContent()}
          </div>
        </div>
      </div>
    </ManagementShell>
  );
}
