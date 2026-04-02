import { useNavigate } from "react-router-dom";
import obraMapIcon from "@/assets/obramap-icon-dark.png";
import {
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Layers,
  CalendarClock,
  BarChart3,
  Users,
  Map,
  DollarSign,
  Search,
  Target,
  TrendingUp,
  ShieldCheck,
  Building2,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/* ─── Section wrapper ─── */
function Section({
  children,
  className = "",
  id,
  dark = false,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
  dark?: boolean;
}) {
  return (
    <section
      id={id}
      className={`w-full px-4 md:px-8 py-20 lg:py-28 ${dark ? "bg-[#0f1a2e]" : "bg-[#1a1a2e]"} ${className}`}
    >
      <div className="max-w-6xl mx-auto">{children}</div>
    </section>
  );
}

/* ─── Badge ─── */
function SectionBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block text-[#e67e22] text-xs font-bold tracking-[0.2em] uppercase mb-4">
      {children}
    </span>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#1a1a2e] text-white font-sans antialiased">
      {/* ═══ NAV ═══ */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#1a1a2e]/90 backdrop-blur-md border-b border-[#2a2a45]/60">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 md:px-8 h-16">
          <div className="flex items-center gap-3">
            <img src={obraMapIcon} alt="ObraMap" className="w-9 h-9 object-contain" />
            <span className="text-lg font-bold text-white">ObraMap</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-[#8a8a9a]">
            <a href="#problema" className="hover:text-white transition-colors">Problema</a>
            <a href="#solucao" className="hover:text-white transition-colors">Solução</a>
            <a href="#como-funciona" className="hover:text-white transition-colors">Como funciona</a>
            <a href="#diferenciais" className="hover:text-white transition-colors">Diferenciais</a>
          </div>
          <div className="flex items-center gap-3">
            <Button
              className="bg-[#e67e22] hover:bg-[#d35400] text-white text-sm font-semibold rounded-lg px-5 flex items-center gap-2"
              onClick={() => navigate("/auth")}
            >
              Login
            </Button>
          </div>
        </div>
      </nav>

      {/* ═══ 1. HERO ═══ */}
      <Section className="pt-32 lg:pt-40">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="flex flex-col gap-6">
            <h1 className="text-4xl md:text-5xl xl:text-6xl font-bold leading-[1.1] tracking-tight">
              Você sabe o que está acontecendo em cada{" "}
              <span className="text-[#e67e22]">unidade da sua obra</span>{" "}agora?
            </h1>
            <p className="text-[#8a8a9a] text-lg leading-relaxed max-w-xl">
              ObraMap é o único sistema construído para obras habitacionais em escala — horizontal ou vertical. Do planejamento à entrega, cada unidade controlada, cada real projetado, cada decisão embasada em dados reais.
            </p>

            <div className="flex flex-col gap-3 mt-2">
              {[
                "Planejamento que se ajusta conforme a produção avança — automático",
                "Status visual de cada unidade no mapa ou em 3D — sem relatório",
                "Saúde financeira de cada obra calculada automaticamente",
                "Simulação de desembolso antes de qualquer compra acontecer",
              ].map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-[#e67e22] flex-shrink-0 mt-0.5" />
                  <span className="text-[#b0b0c0] text-sm leading-snug">{item}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-4 mt-4">
              <Button
                size="lg"
                className="bg-[#e67e22] hover:bg-[#d35400] text-white font-semibold rounded-lg text-base px-8 h-12"
                onClick={() => window.open("https://wa.me/5553999307786?text=" + encodeURIComponent("Olá! Quero ver o ObraMap funcionando na prática. Pode me ajudar?"), "_blank")}
              >
                Ver minha obra funcionando
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-[#3a3a55] text-[#b0b0c0] hover:text-white hover:border-[#e67e22] rounded-lg text-base px-8 h-12 bg-transparent"
                onClick={() => {
                  document.getElementById("como-funciona")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                Ver como funciona
                <ChevronRight className="ml-1 h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Hero visual */}
          <div className="hidden lg:flex items-center justify-center">
            <div className="relative w-80 h-80">
              <div className="absolute inset-0 bg-[#e67e22]/10 rounded-full blur-3xl" />
              <img
                src={obraMapIcon}
                alt="ObraMap"
                className="relative w-full h-full object-contain drop-shadow-2xl"
              />
            </div>
          </div>
        </div>
      </Section>

      {/* ═══ 2. PROBLEMA ═══ */}
      <Section id="problema" dark>
        <div className="text-center max-w-3xl mx-auto mb-14">
          <SectionBadge>O Problema</SectionBadge>
          <h2 className="text-3xl md:text-4xl font-bold mb-5">
            Sua obra está rodando <span className="text-[#e67e22]">no escuro</span>
          </h2>
          <p className="text-[#8a8a9a] text-base leading-relaxed">
            Você planeja em uma planilha, controla custo em outra, acompanha produção por WhatsApp e mede serviços manualmente. Seja em casas, sobrados ou apartamentos — o problema é o mesmo.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {[
            { icon: AlertTriangle, title: "O prazo escapa", desc: "Sem visão real por unidade, os atrasos só aparecem quando já é tarde demais." },
            { icon: DollarSign, title: "O custo estoura", desc: "Retrabalho e falta de controle geram desperdícios invisíveis em cada unidade executada." },
            { icon: Search, title: "Problema descoberto tarde", desc: "Sem rastreabilidade por unidade, erros de execução passam despercebidos por semanas." },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-xl border border-[#2a2a45] bg-[#16213e]/60 p-6 text-center"
            >
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-red-500/10 mb-4">
                <item.icon className="w-6 h-6 text-red-400" />
              </div>
              <h3 className="font-semibold text-white text-lg mb-2">{item.title}</h3>
              <p className="text-[#8a8a9a] text-sm leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
          {[
            "Falta de visão real da produção por unidade",
            "Dificuldade de dimensionar equipes para o ritmo da obra",
            "Retrabalho por falta de controle de execução",
            "Medições demoradas e sujeitas a erro",
            "Planejamento que não reflete a realidade do canteiro",
          ].map((pain) => (
            <div key={pain} className="flex items-center gap-3 bg-[#1a1a2e]/60 rounded-lg px-4 py-3 border border-[#2a2a45]/50">
              <div className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
              <span className="text-[#b0b0c0] text-sm">{pain}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ═══ 3. SOLUÇÃO ═══ */}
      <Section id="solucao">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <SectionBadge>A Solução</SectionBadge>
          <h2 className="text-3xl md:text-4xl font-bold mb-5">
            Um sistema pensado para <span className="text-[#e67e22]">obras habitacionais em série</span>
          </h2>
          <p className="text-[#8a8a9a] text-base leading-relaxed">
            Horizontal ou vertical. Casas, sobrados ou apartamentos. O ObraMap conecta todas as etapas da obra em um único fluxo, com controle por unidade do início ao fim.
          </p>
        </div>

        {/* Flow */}
        <div className="flex flex-wrap items-center justify-center gap-3 mb-14">
          {["Estrutura", "Planejamento", "Execução", "Medição", "Custo"].map((step, i) => (
            <div key={step} className="flex items-center gap-3">
              <div className="bg-[#e67e22]/10 border border-[#e67e22]/30 rounded-lg px-5 py-3 text-[#e67e22] font-semibold text-sm">
                {step}
              </div>
              {i < 4 && <ArrowRight className="w-4 h-4 text-[#3a3a55]" />}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {[
            { icon: Target, text: "Controle por unidade, não só por etapa" },
            { icon: Layers, text: "Produção conectada ao planejamento em tempo real" },
            { icon: Users, text: "Equipes dimensionadas com base em produtividade real" },
            { icon: BarChart3, text: "Dados confiáveis para tomada de decisão da diretoria" },
          ].map((item) => (
            <div key={item.text} className="flex items-start gap-4 bg-[#16213e]/40 border border-[#2a2a45] rounded-xl p-5">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[#e67e22]/10 flex items-center justify-center">
                <item.icon className="w-5 h-5 text-[#e67e22]" />
              </div>
              <span className="text-[#b0b0c0] text-sm leading-relaxed pt-2">{item.text}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ═══ 4. COMO FUNCIONA ═══ */}
      <Section id="como-funciona" dark>
        <div className="text-center max-w-3xl mx-auto mb-14">
          <SectionBadge>Passo a passo</SectionBadge>
          <h2 className="text-3xl md:text-4xl font-bold mb-5">
            Como o ObraMap funciona <span className="text-[#e67e22]">na prática</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            {
              step: "01",
              title: "Estruture sua obra",
              desc: "Cadastre quadras, torres, blocos, serviços e orçamento. O sistema monta o mapa visual da obra automaticamente.",
              icon: Layers,
            },
            {
              step: "02",
              title: "Planeje com inteligência",
              desc: "Defina metas por período. O sistema calcula equipes necessárias, datas e capacidade — sem planilha.",
              icon: CalendarClock,
            },
            {
              step: "03",
              title: "Acompanhe unidade por unidade",
              desc: "Lance produção por serviço e unidade. O mapa atualiza em tempo real — todo atraso fica visível na hora.",
              icon: BarChart3,
            },
            {
              step: "04",
              title: "Controle custo e entrega",
              desc: "Medições conectadas à execução real. Saúde financeira calculada automaticamente. Da produção à chave entregue.",
              icon: DollarSign,
            },
          ].map((item) => (
            <div
              key={item.step}
              className="relative rounded-xl border border-[#2a2a45] bg-[#16213e]/60 p-6 flex flex-col gap-4"
            >
              <span className="text-[#e67e22] text-3xl font-bold opacity-30">{item.step}</span>
              <div className="w-10 h-10 rounded-lg bg-[#e67e22]/10 flex items-center justify-center">
                <item.icon className="w-5 h-5 text-[#e67e22]" />
              </div>
              <h3 className="font-semibold text-white text-base">{item.title}</h3>
              <p className="text-[#8a8a9a] text-sm leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ═══ 5. DIFERENCIAIS ═══ */}
      <Section id="diferenciais">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <SectionBadge>Diferenciais</SectionBadge>
          <h2 className="text-3xl md:text-4xl font-bold mb-5">
            O que torna o ObraMap <span className="text-[#e67e22]">diferente</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              icon: Map,
              title: "Controle visual por unidade",
              desc: "Mapa interativo e visualização 3D com o status de cada unidade — casa, sobrado ou apartamento — em tempo real.",
            },
            {
              icon: CalendarClock,
              title: "Planejamento inteligente em 4 camadas",
              desc: "Estratégico, por período, semanal e com Linha de Balanço. Cronograma que se ajusta com a execução real.",
            },
            {
              icon: BarChart3,
              title: "Saúde financeira automática",
              desc: "IDC e IDP calculados automaticamente para cada obra. O diretor vê verde, amarelo ou vermelho — sem planilha.",
            },
            {
              icon: DollarSign,
              title: "Simulação de desembolso antecipado",
              desc: "Projete o fluxo de caixa de materiais antes de qualquer pedido de compra. Não depois da nota chegar.",
            },
            {
              icon: Users,
              title: "Empreiteiros e PLE integrados",
              desc: "Medições de empreiteiro conectadas ao planejamento e ao financeiro. Tudo no mesmo sistema.",
            },
            {
              icon: Search,
              title: "Rastreabilidade completa por unidade",
              desc: "Saiba quem executou cada serviço em cada unidade, quando foi medido e quanto foi pago.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="group rounded-xl border border-[#2a2a45] bg-[#16213e]/40 p-6 hover:border-[#e67e22]/40 transition-colors"
            >
              <div className="w-12 h-12 rounded-xl bg-[#e67e22]/10 flex items-center justify-center mb-4 group-hover:bg-[#e67e22]/20 transition-colors">
                <item.icon className="w-6 h-6 text-[#e67e22]" />
              </div>
              <h3 className="font-semibold text-white text-lg mb-2">{item.title}</h3>
              <p className="text-[#8a8a9a] text-sm leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ═══ 6. RESULTADOS ═══ */}
      <Section dark>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <SectionBadge>Resultados</SectionBadge>
            <h2 className="text-3xl md:text-4xl font-bold mb-5">
              Mais controle, <span className="text-[#e67e22]">menos improviso</span>
            </h2>
            <p className="text-[#8a8a9a] text-base leading-relaxed mb-8">
              O ObraMap transforma a forma como construtoras gerenciam suas obras. Em vez de descobrir problemas no relatório do fim do mês, você age no momento certo — com dados reais de cada unidade.
            </p>

            <div className="flex flex-col gap-4">
              {[
                "Atrasos identificados antes de virar problema",
                "Equipes alocadas com base em capacidade real",
                "Medições sem retrabalho — integradas à execução",
                "Fluxo de caixa de materiais projetado com antecedência",
                "Diretoria com visão de saúde de todas as obras em segundos",
              ].map((result) => (
                <div key={result} className="flex items-center gap-3">
                  <TrendingUp className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  <span className="text-[#b0b0c0] text-base">{result}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-center">
            <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
              {[
                { label: "Produção", icon: BarChart3 },
                { label: "Equipe", icon: Users },
                { label: "Controle", icon: ShieldCheck },
                { label: "Previsibilidade", icon: Target },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-[#2a2a45] bg-[#16213e]/60 p-6 text-center"
                >
                  <item.icon className="w-8 h-8 text-[#e67e22] mx-auto mb-3" />
                  <span className="text-white font-semibold text-sm">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ═══ 7. PARA QUEM É ═══ */}
      <Section>
        <div className="text-center max-w-3xl mx-auto mb-14">
          <SectionBadge>Para quem é</SectionBadge>
          <h2 className="text-3xl md:text-4xl font-bold mb-5">
            Feito para quem constrói <span className="text-[#e67e22]">unidades habitacionais em escala</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
          {[
            { icon: Building2, text: "Construtoras de obras horizontais", sub: "Casas, sobrados, loteamentos e condomínios horizontais." },
            { icon: Layers, text: "Construtoras de obras verticais", sub: "Edifícios residenciais, apartamentos e torres em série." },
            { icon: Target, text: "Obras com produção repetitiva", sub: "Qualquer empreendimento com unidades padronizadas." },
            { icon: ShieldCheck, text: "Empresas que precisam de controle real", sub: "Gestores que não aceitam descobrir problemas só no fim do mês." },
          ].map((item) => (
            <div
              key={item.text}
              className="rounded-xl border border-[#2a2a45] bg-[#16213e]/40 p-6 text-center flex flex-col items-center gap-3"
            >
              <div className="w-12 h-12 rounded-xl bg-[#e67e22]/10 flex items-center justify-center">
                <item.icon className="w-6 h-6 text-[#e67e22]" />
              </div>
              <span className="text-white text-sm font-semibold leading-snug">{item.text}</span>
              <span className="text-[#8a8a9a] text-xs leading-relaxed">{item.sub}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ═══ 8. MISSÃO ═══ */}
      <Section>
        <div className="text-center max-w-3xl mx-auto">
          <SectionBadge>Nossa missão</SectionBadge>
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Clareza para quem <span className="text-[#e67e22]">constrói o Brasil</span>
          </h2>
          <p className="text-[#8a8a9a] text-base leading-relaxed mb-10">
            Dar às construtoras habitacionais a visibilidade que precisam para construir melhor — controlando cada unidade, cada equipe e cada real investido, em tempo real. Do projeto à entrega, o ObraMap foi construído para que nenhuma decisão seja tomada no escuro.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-4xl mx-auto text-left">
            {[
              { title: "Clareza antes de relatório", desc: "A informação certa tem que ser visual, imediata e sem intermediário." },
              { title: "Construído para o canteiro", desc: "Partimos de como obras habitacionais realmente funcionam — não adaptamos um ERP genérico." },
              { title: "Crescimento com controle", desc: "Escalar de 10 para 2.000 unidades sem perder a granularidade de cada uma." },
              { title: "Dado que protege", desc: "Segurança, rastreabilidade e auditoria — o patrimônio da construtora está nos dados." },
            ].map((item) => (
              <div key={item.title} className="rounded-xl border border-[#2a2a45] bg-[#16213e]/40 p-5">
                <div className="w-2 h-2 rounded-full bg-[#e67e22] mb-3" />
                <h3 className="text-white text-sm font-semibold mb-2">{item.title}</h3>
                <p className="text-[#8a8a9a] text-xs leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ═══ 9. CTA FINAL ═══ */}
      <Section dark>
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold mb-5">
            Pronto para ter <span className="text-[#e67e22]">clareza real</span> sobre cada obra?
          </h2>
          <p className="text-[#8a8a9a] text-base leading-relaxed mb-8">
            Agende uma demonstração e veja o ObraMap funcionando com dados reais — sem compromisso.
          </p>
          <Button
            size="lg"
            className="bg-[#e67e22] hover:bg-[#d35400] text-white font-semibold rounded-lg text-base px-10 h-14"
            onClick={() => window.open("https://wa.me/5553999307786?text=" + encodeURIComponent("Olá! Quero ver o ObraMap funcionando na prática. Pode me ajudar?"), "_blank")}
          >
            Solicitar demonstração
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </Section>

      {/* ═══ FOOTER ═══ */}
      <footer className="bg-[#0a0f1e] border-t border-[#2a2a45]/40 py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={obraMapIcon} alt="ObraMap" className="w-7 h-7 object-contain" />
            <span className="text-white font-semibold text-sm">ObraMap</span>
          </div>
          <p className="text-[#5a5a70] text-xs">
            © {new Date().getFullYear()} ObraMap — Gestão de obras habitacionais horizontais e verticais
          </p>
        </div>
      </footer>
    </div>
  );
}
