import { useEffect, useState } from 'react';
import {
  Row, Col, Card, Statistic, Typography, Table, Progress,
  Space, Tag, Tabs, Divider, Select, Button, Input,
} from 'antd';
import {
  ArrowUpOutlined, ArrowDownOutlined, MinusOutlined, PrinterOutlined, FilePdfOutlined, SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useObrasStore } from '../../stores/useObrasStore';
import { useEtapasStore } from '../../stores/useEtapasStore';
import { useLancamentosStore } from '../../stores/useLancamentosStore';
import { useClientesStore } from '../../stores/useClientesStore';
import { ObraStatusTag } from '../../components/common/StatusTag';
import type { Obra, Lancamento, StatusLancamento } from '../../types';
import { formatarMoeda, formatarData, titleCase } from '../../utils';

const { Title, Text } = Typography;

const STATUS_COLOR: Record<StatusLancamento, string> = {
  pendente: 'gold', pago: 'green', parcial: 'cyan', vencido: 'red', cancelado: 'default',
};
const STATUS_LABEL: Record<StatusLancamento, string> = {
  pendente: 'Pendente', pago: 'Pago', parcial: 'Parcial', vencido: 'Vencido', cancelado: 'Cancelado',
};

function progressoObra(obraId: string, etapas: ReturnType<typeof useEtapasStore.getState>['etapas']): number {
  const et = etapas.filter(e => e.obraId === obraId);
  if (!et.length) return 0;
  const total = et.reduce((s, e) => s + (e.peso || 1), 0);
  const feito = et.reduce((s, e) => {
    const p = e.status === 'concluida' ? (e.peso || 1) : ((e.percentualExecutado || 0) / 100) * (e.peso || 1);
    return s + p;
  }, 0);
  return Math.round((feito / total) * 100);
}

function DRELinha({
  label, valor, cor, destaque, indent, separador,
}: {
  label?: string; valor?: number; cor?: string; destaque?: boolean; indent?: boolean; separador?: boolean;
}) {
  if (separador) return <Divider style={{ margin: '6px 0' }} />;
  const v = valor ?? 0;
  return (
    <Row justify="space-between" align="middle" style={{
      padding: `${destaque ? 8 : 5}px ${indent ? 24 : 0}px`,
      background: destaque ? '#fafafa' : 'transparent',
      borderRadius: destaque ? 6 : 0,
      fontWeight: destaque ? 700 : 400,
    }}>
      <Col>
        <Text style={{ fontSize: destaque ? 14 : 13, color: indent ? '#595959' : undefined }}>
          {label}
        </Text>
      </Col>
      <Col>
        <Text style={{ fontSize: destaque ? 14 : 13, color: cor || (v < 0 ? '#ff4d4f' : undefined) }}>
          {formatarMoeda(v)}
        </Text>
      </Col>
    </Row>
  );
}

interface DRESection {
  titulo: string;
  sinal: '+' | '-' | '=';
  itens: { label: string; valor: number; cor?: string }[];
  total: number;
  corTotal?: string;
}

function SecaoDRE({ s }: { s: DRESection }) {
  const sinColor = s.sinal === '+' ? '#52c41a' : s.sinal === '-' ? '#ff4d4f' : '#1677ff';
  return (
    <div style={{ marginBottom: 16 }}>
      <Row align="middle" style={{ marginBottom: 6 }}>
        <Col>
          <Tag color={s.sinal === '+' ? 'green' : s.sinal === '-' ? 'red' : 'blue'}
            style={{ fontWeight: 700, fontSize: 11 }}>
            {s.sinal === '+' ? <ArrowUpOutlined /> : s.sinal === '-' ? <ArrowDownOutlined /> : <MinusOutlined />}
            {' '}{s.titulo}
          </Tag>
        </Col>
      </Row>
      {s.itens.map((item, i) => (
        <DRELinha key={i} label={item.label} valor={item.valor} indent cor={item.cor} />
      ))}
      <DRELinha label={`Total ${s.titulo}`} valor={s.total} destaque cor={s.corTotal || sinColor} />
    </div>
  );
}

const ANOS = Array.from({ length: 5 }, (_, i) => {
  const y = new Date().getFullYear() - 2 + i;
  return { value: String(y), label: String(y) };
});

export default function RelatoriosPage() {
  const { obras, fetch: fetchObras } = useObrasStore();
  const { etapas, fetch: fetchEtapas } = useEtapasStore();
  const { lancamentos, fetch: fetchLanc } = useLancamentosStore();
  const { clientes, fetch: fetchClientes } = useClientesStore();

  const [anoFiltro, setAnoFiltro] = useState<string>('todos');
  const [anoFiltroReceber, setAnoFiltroReceber] = useState<string>('todos');
  const [statusFiltroReceber, setStatusFiltroReceber] = useState<StatusLancamento | 'todos'>('todos');
  const [buscaReceber, setBuscaReceber] = useState('');

  useEffect(() => {
    fetchObras(); fetchEtapas(); fetchLanc(); fetchClientes();
  }, []);

  // ── Filtro período ──
  const lancFiltrados = anoFiltro === 'todos'
    ? lancamentos
    : lancamentos.filter(l => (l.vencimento || l.criadoEm || '').startsWith(anoFiltro));

  // ── KPIs gerais ──
  const obrasAtivas = obras.filter(o => o.status !== 'cancelada');
  const totalContrato = obrasAtivas.reduce((s, o) => s + (o.valorContrato || 0), 0);
  const totalRecebido = lancamentos.filter(l => l.tipo === 'receita' && l.status === 'pago').reduce((s, l) => s + l.valor, 0);
  const totalPago = lancamentos.filter(l => l.tipo === 'despesa' && l.status === 'pago').reduce((s, l) => s + l.valor, 0);
  const saldo = totalRecebido - totalPago;
  const emAndamento = obras.filter(o => o.status === 'andamento').length;
  const concluidas = obras.filter(o => o.status === 'concluida').length;

  const matsPendentes = etapas.flatMap(e => (e.materiais || [])
    .filter(m => m.qtdComprada < m.qtdPrevista && m.qtdPrevista > 0)
  ).length;

  const hojeStr = new Date().toISOString().slice(0, 10);
  const em30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const receitasPendentes = lancamentos.filter(l =>
    l.tipo === 'receita' && l.status === 'pendente' && l.vencimento >= hojeStr && l.vencimento <= em30
  ).reduce((s, l) => s + l.valor, 0);

  // ── DRE ──
  // Receitas realizadas (pagas) por categoria
  const receitasPagas   = lancFiltrados.filter(l => l.tipo === 'receita' && l.status === 'pago');
  const receitasAReceber = lancFiltrados.filter(l => l.tipo === 'receita' && l.status === 'pendente');

  const totalRecPago    = receitasPagas.reduce((s, l) => s + l.valor, 0);
  const totalRecPend    = receitasAReceber.reduce((s, l) => s + l.valor, 0);

  // Despesas pagas por categoria
  const despPagas  = lancFiltrados.filter(l => l.tipo === 'despesa' && l.status === 'pago' && !l.socioId);
  const despPend   = lancFiltrados.filter(l => l.tipo === 'despesa' && l.status === 'pendente' && !l.socioId);
  const distPagas  = lancFiltrados.filter(l => l.tipo === 'despesa' && l.status === 'pago' && !!l.socioId);
  const distPend   = lancFiltrados.filter(l => l.tipo === 'despesa' && l.status === 'pendente' && !!l.socioId);

  function somarCat(lista: typeof lancamentos, cat: string) {
    return lista.filter(l => l.categoria === cat).reduce((s, l) => s + l.valor, 0);
  }

  const totalDespPagas = despPagas.reduce((s, l) => s + l.valor, 0);
  const totalDespPend  = despPend.reduce((s, l) => s + l.valor, 0);
  const totalDistPago  = distPagas.reduce((s, l) => s + l.valor, 0);
  const totalDistPend  = distPend.reduce((s, l) => s + l.valor, 0);

  // Categorias de despesa com valores
  const categoriasDespPagas = [
    { label: 'Mão de Obra',  valor: somarCat(despPagas, 'mao-de-obra') },
    { label: 'Material',     valor: somarCat(despPagas, 'material') },
    { label: 'Ferramenta',   valor: somarCat(despPagas, 'ferramenta') },
    { label: 'Combustível',  valor: somarCat(despPagas, 'combustivel') },
    { label: 'Comissão',     valor: somarCat(despPagas, 'comissao') },
    { label: 'Imposto',      valor: somarCat(despPagas, 'imposto') },
    { label: 'Reembolso',    valor: somarCat(despPagas, 'reembolso') },
    { label: 'Outros',       valor: despPagas.filter(l => !l.categoria || l.categoria === 'outros').reduce((s, l) => s + l.valor, 0) },
  ].filter(c => c.valor > 0);

  const categoriasDespPend = [
    { label: 'Mão de Obra a pagar',  valor: somarCat(despPend, 'mao-de-obra') },
    { label: 'Material a pagar',     valor: somarCat(despPend, 'material') },
    { label: 'Outros a pagar',       valor: despPend.filter(l => !['mao-de-obra','material'].includes(l.categoria || '')).reduce((s, l) => s + l.valor, 0) },
  ].filter(c => c.valor > 0);

  // Resultados chave
  const resultadoBruto    = totalRecPago - totalDespPagas;
  const resultadoLiquido  = resultadoBruto - totalDistPago;
  const saldoProjetado    = (totalRecPago + totalRecPend) - (totalDespPagas + totalDespPend);

  // ── Tabela obras ──
  const obrasCols: ColumnsType<Obra> = [
    { title: 'Obra', dataIndex: 'nome', render: (n: string, r) => (
      <div><Text strong>{n}</Text>
        {r.clienteNome && <div><Text type="secondary" style={{ fontSize: 12 }}>{r.clienteNome}</Text></div>}
      </div>
    )},
    { title: 'Status', dataIndex: 'status', width: 130, render: s => <ObraStatusTag status={s} /> },
    { title: 'Progresso', key: 'prog', width: 150, render: (_, r) => {
      const pct = progressoObra(r.id, etapas);
      return <Progress percent={pct} size="small" status={pct === 100 ? 'success' : 'active'} />;
    }},
    { title: 'Etapas', key: 'etapas', width: 90, render: (_, r) => {
      const et = etapas.filter(e => e.obraId === r.id);
      const conc = et.filter(e => e.status === 'concluida').length;
      return <Text style={{ fontSize: 12 }}>{conc}/{et.length}</Text>;
    }},
    { title: 'Contrato', dataIndex: 'valorContrato', width: 130,
      render: (v: number) => v ? formatarMoeda(v) : <Text type="secondary">—</Text> },
    { title: 'Início', dataIndex: 'dataInicio', width: 110, render: (d: string) => formatarData(d) },
    { title: 'Previsão', dataIndex: 'dataPrevisaoFim', width: 110, render: (d: string) => formatarData(d) },
  ];

  const porCliente = clientes.map(c => ({
    ...c,
    totalObras: obras.filter(o => o.clienteId === c.id).length,
    totalContrato: obras.filter(o => o.clienteId === c.id).reduce((s, o) => s + (o.valorContrato || 0), 0),
  })).filter(c => c.totalObras > 0).sort((a, b) => b.totalContrato - a.totalContrato);

  // ── Receber por Obra ──
  const lancReceber = anoFiltroReceber === 'todos'
    ? lancamentos
    : lancamentos.filter(l => (l.vencimento || l.criadoEm || '').startsWith(anoFiltroReceber));

  interface ObraRec extends Obra { lancRec: Lancamento[]; recebido: number; pendente: number; }
  const receitasPorObra: ObraRec[] = obras
    .filter(o => o.status !== 'cancelada')
    .map(obra => {
      const lancRec = lancReceber.filter(l => l.tipo === 'receita' && l.obraId === obra.id && l.status !== 'cancelado');
      const recebido = lancRec.filter(l => l.status === 'pago').reduce((s, l) => s + l.valor, 0);
      const pendente = lancRec.filter(l => l.status !== 'pago').reduce((s, l) => s + l.valor, 0);
      return { ...obra, lancRec, recebido, pendente };
    })
    .filter(o => o.lancRec.length > 0)
    .sort((a, b) => b.recebido - a.recebido);

  const totRecebido = receitasPorObra.reduce((s, o) => s + o.recebido, 0);
  const totPendente = receitasPorObra.reduce((s, o) => s + o.pendente, 0);

  // ── Contas a Receber (completo, todos os lançamentos de receita) ──
  const receberCompletoBase = lancReceber.filter(l => l.tipo === 'receita');
  const receberCompleto = receberCompletoBase
    .filter(l => statusFiltroReceber === 'todos' || l.status === statusFiltroReceber)
    .filter(l => !buscaReceber ||
      l.descricao.toLowerCase().includes(buscaReceber.toLowerCase()) ||
      (l.obraNome || '').toLowerCase().includes(buscaReceber.toLowerCase()) ||
      (l.clienteNome || '').toLowerCase().includes(buscaReceber.toLowerCase()))
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));

  const rcRecebido = receberCompletoBase.filter(l => l.status === 'pago').reduce((s, l) => s + l.valor, 0);
  const rcPendente = receberCompletoBase.filter(l => l.status === 'pendente').reduce((s, l) => s + l.valor, 0);
  const rcVencido   = receberCompletoBase.filter(l => l.status === 'vencido').reduce((s, l) => s + l.valor, 0);
  const rcTotal     = receberCompletoBase.filter(l => l.status !== 'cancelado').reduce((s, l) => s + l.valor, 0);

  // ── Impressão consolidada — fechamento geral da empresa ──
  function imprimirFechamentoCompleto() {
    const agora = new Date().toLocaleString('pt-BR');
    const linha = (label: string, valor: number, cor = '#000') =>
      `<tr><td>${label}</td><td style="text-align:right;color:${cor};font-weight:600;">${formatarMoeda(valor)}</td></tr>`;

    const secObras = obrasAtivas.map(o => `
      <tr>
        <td>${o.nome}${o.clienteNome ? `<br/><span style="color:#888;font-size:11px;">${o.clienteNome}</span>` : ''}</td>
        <td>${o.status}</td>
        <td style="text-align:right;">${progressoObra(o.id, etapas)}%</td>
        <td style="text-align:right;">${o.valorContrato ? formatarMoeda(o.valorContrato) : '—'}</td>
      </tr>`).join('');

    const secReceberObra = receitasPorObra.map(o => `
      <tr>
        <td>${o.nome}${o.clienteNome ? `<br/><span style="color:#888;font-size:11px;">${o.clienteNome}</span>` : ''}</td>
        <td style="text-align:right;color:#2e7d32;">${formatarMoeda(o.recebido)}</td>
        <td style="text-align:right;color:#e65100;">${formatarMoeda(o.pendente)}</td>
        <td style="text-align:right;font-weight:600;">${formatarMoeda(o.recebido + o.pendente)}</td>
      </tr>`).join('');

    const secReceberCompleto = receberCompletoBase
      .slice().sort((a, b) => a.vencimento.localeCompare(b.vencimento))
      .map(l => `
      <tr>
        <td>${titleCase(l.descricao)}${l.obraNome ? `<br/><span style="color:#888;font-size:11px;">${l.obraNome}</span>` : ''}</td>
        <td>${formatarData(l.vencimento)}</td>
        <td>${l.pagamento ? formatarData(l.pagamento) : '—'}</td>
        <td>${STATUS_LABEL[l.status]}</td>
        <td style="text-align:right;font-weight:600;">${formatarMoeda(l.valor)}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <title>Fechamento Geral — N30 Engenharia</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; font-size: 12px; padding: 28px; color: #222; }
        h1 { font-size: 20px; margin: 0; }
        h2 { font-size: 14px; margin: 28px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #1677ff; color: #1677ff; }
        .cabecalho { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #1677ff; padding-bottom: 12px; margin-bottom: 4px; }
        .cabecalho .sub { color: #666; font-size: 11px; margin-top: 2px; }
        table { width: 100%; border-collapse: collapse; margin-top: 6px; }
        th, td { border: 1px solid #ddd; padding: 5px 8px; font-size: 11px; }
        th { background: #f5f5f5; text-align: left; }
        .kpis { display: flex; gap: 10px; margin-top: 10px; }
        .kpi { flex: 1; border: 1px solid #ddd; border-radius: 6px; padding: 10px; text-align: center; }
        .kpi .v { font-size: 16px; font-weight: 700; }
        .kpi .l { font-size: 10px; color: #888; text-transform: uppercase; }
        @media print { button { display: none; } }
      </style></head>
      <body>
      <button onclick="window.print()" style="margin-bottom:16px;padding:8px 16px;cursor:pointer">🖨️ Imprimir</button>
      <div class="cabecalho">
        <div>
          <h1>N30 Engenharia</h1>
          <div class="sub">Fechamento Geral da Empresa</div>
        </div>
        <div class="sub">Gerado em ${agora}</div>
      </div>

      <h2>Visão Geral</h2>
      <div class="kpis">
        <div class="kpi"><div class="v">${formatarMoeda(totalContrato)}</div><div class="l">Volume Contratado</div></div>
        <div class="kpi"><div class="v" style="color:#2e7d32;">${formatarMoeda(totalRecebido)}</div><div class="l">Total Recebido</div></div>
        <div class="kpi"><div class="v" style="color:#c62828;">${formatarMoeda(totalPago)}</div><div class="l">Total Pago</div></div>
        <div class="kpi"><div class="v" style="color:${saldo >= 0 ? '#2e7d32' : '#c62828'};">${formatarMoeda(saldo)}</div><div class="l">Saldo</div></div>
      </div>

      <h2>Resumo por Obra</h2>
      <table><thead><tr><th>Obra</th><th>Status</th><th style="text-align:right;">Progresso</th><th style="text-align:right;">Contrato</th></tr></thead>
      <tbody>${secObras || '<tr><td colspan="4">Nenhuma obra.</td></tr>'}</tbody></table>

      <h2>DRE — Demonstrativo de Resultados${anoFiltro !== 'todos' ? ` (${anoFiltro})` : ''}</h2>
      <table><tbody>
        ${linha('Receitas realizadas (pagas)', totalRecPago, '#2e7d32')}
        ${linha('A receber (pendentes)', totalRecPend, '#1565c0')}
        ${linha('Despesas pagas', -totalDespPagas, '#c62828')}
        ${linha('Despesas a pagar (pendentes)', -totalDespPend, '#e65100')}
        <tr><td colspan="2"><hr/></td></tr>
        ${linha('= Resultado Bruto', resultadoBruto, resultadoBruto >= 0 ? '#2e7d32' : '#c62828')}
        ${totalDistPago > 0 ? linha('(−) Distribuições realizadas', -totalDistPago, '#c62828') : ''}
        ${totalDistPago > 0 ? linha('= Resultado Líquido', resultadoLiquido, resultadoLiquido >= 0 ? '#2e7d32' : '#c62828') : ''}
        <tr><td colspan="2"><hr/></td></tr>
        ${linha('= Saldo Projetado (realizado + pendente)', saldoProjetado, saldoProjetado >= 0 ? '#2e7d32' : '#c62828')}
      </tbody></table>

      <h2>Contas a Receber — Completo</h2>
      <div class="kpis">
        <div class="kpi"><div class="v" style="color:#2e7d32;">${formatarMoeda(rcRecebido)}</div><div class="l">Recebido</div></div>
        <div class="kpi"><div class="v" style="color:#f9a825;">${formatarMoeda(rcPendente)}</div><div class="l">Pendente</div></div>
        <div class="kpi"><div class="v" style="color:#c62828;">${formatarMoeda(rcVencido)}</div><div class="l">Vencido</div></div>
        <div class="kpi"><div class="v">${formatarMoeda(rcTotal)}</div><div class="l">Total Geral</div></div>
      </div>
      <table><thead><tr><th>Descrição</th><th>Vencimento</th><th>Pagamento</th><th>Status</th><th style="text-align:right;">Valor</th></tr></thead>
      <tbody>${secReceberCompleto || '<tr><td colspan="5">Nenhum lançamento.</td></tr>'}</tbody></table>

      <h2>Receber por Obra</h2>
      <table><thead><tr><th>Obra</th><th style="text-align:right;">Recebido</th><th style="text-align:right;">Pendente</th><th style="text-align:right;">Total</th></tr></thead>
      <tbody>${secReceberObra || '<tr><td colspan="4">Nenhuma obra com receitas.</td></tr>'}</tbody></table>

      </body></html>`;

    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  }

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 20 }}>
        <Col><Title level={4} style={{ margin: 0 }}>Relatórios</Title></Col>
        <Col>
          <Button type="primary" icon={<FilePdfOutlined />} onClick={imprimirFechamentoCompleto}>
            Imprimir Fechamento Completo
          </Button>
        </Col>
      </Row>

      <Tabs
        defaultActiveKey="geral"
        items={[
          // ── TAB 1: GERAL ─────────────────────────────────────────────────
          {
            key: 'geral',
            label: 'Visão Geral',
            children: (
              <div>
                <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
                  {[
                    { title: 'Volume total contratado', value: formatarMoeda(totalContrato) },
                    { title: 'Total recebido', value: formatarMoeda(totalRecebido), color: '#52c41a' },
                    { title: 'Total pago (despesas)', value: formatarMoeda(totalPago), color: '#ff4d4f' },
                    { title: 'Saldo (recebido − pago)', value: formatarMoeda(saldo), color: saldo >= 0 ? '#52c41a' : '#ff4d4f' },
                  ].map((k, i) => (
                    <Col xs={12} sm={6} key={i}>
                      <Card size="small">
                        <Statistic title={k.title} value={k.value} valueStyle={{ color: k.color, fontSize: 16 }} />
                      </Card>
                    </Col>
                  ))}
                </Row>

                <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
                  {[
                    { title: 'Obras em andamento', value: emAndamento, color: '#1677ff' },
                    { title: 'Obras concluídas', value: concluidas, color: '#52c41a' },
                    { title: 'Materiais p/ comprar', value: matsPendentes, color: matsPendentes > 0 ? '#faad14' : undefined },
                    { title: 'Receitas a receber (30d)', value: formatarMoeda(receitasPendentes), color: '#faad14' },
                  ].map((k, i) => (
                    <Col xs={12} sm={6} key={i}>
                      <Card size="small">
                        <Statistic title={k.title} value={k.value} valueStyle={{ color: k.color, fontSize: 20 }} />
                      </Card>
                    </Col>
                  ))}
                </Row>

                <Card title="Resumo por obra" style={{ marginBottom: 20 }}>
                  <Table dataSource={obrasAtivas} columns={obrasCols} rowKey="id" size="small"
                    pagination={false} locale={{ emptyText: 'Nenhuma obra.' }} />
                </Card>

                {porCliente.length > 0 && (
                  <Card title="Clientes por volume">
                    <Table dataSource={porCliente} rowKey="id" size="small" pagination={false}
                      columns={[
                        { title: 'Cliente', dataIndex: 'nome', render: (n: string, r) => (
                          <Space><Text strong>{n}</Text><Tag>{r.tipo.toUpperCase()}</Tag></Space>
                        )},
                        { title: 'Obras', dataIndex: 'totalObras', width: 80, align: 'center' as const },
                        { title: 'Volume total', dataIndex: 'totalContrato', width: 160,
                          render: (v: number) => <Text strong>{formatarMoeda(v)}</Text> },
                      ]}
                    />
                  </Card>
                )}
              </div>
            ),
          },

          // ── TAB 2: DRE ───────────────────────────────────────────────────
          {
            key: 'dre',
            label: 'DRE — Resultado',
            children: (
              <div>
                <Row justify="space-between" align="middle" style={{ marginBottom: 20 }}>
                  <Col>
                    <Title level={5} style={{ margin: 0 }}>Demonstrativo de Resultados</Title>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Baseado nos lançamentos cadastrados em Contas a Receber e Contas a Pagar
                    </Text>
                  </Col>
                  <Col>
                    <Space>
                      <Text type="secondary">Período:</Text>
                      <Select
                        value={anoFiltro}
                        onChange={setAnoFiltro}
                        style={{ width: 120 }}
                        options={[
                          { value: 'todos', label: 'Todos' },
                          ...ANOS,
                        ]}
                      />
                    </Space>
                  </Col>
                </Row>

                <Row gutter={[16, 16]}>
                  {/* Coluna principal DRE */}
                  <Col xs={24} lg={14}>
                    <Card size="small" style={{ marginBottom: 16 }}>
                      {/* RECEITAS REALIZADAS */}
                      <SecaoDRE s={{
                        titulo: 'RECEITAS REALIZADAS (pagas)',
                        sinal: '+',
                        itens: receitasPagas.length > 0
                          ? [
                              { label: 'Receitas de Obras', valor: receitasPagas.filter(l => !!l.obraId).reduce((s, l) => s + l.valor, 0) },
                              { label: 'Outras Receitas', valor: receitasPagas.filter(l => !l.obraId).reduce((s, l) => s + l.valor, 0) },
                            ].filter(i => i.valor > 0)
                          : [{ label: 'Sem receitas realizadas', valor: 0 }],
                        total: totalRecPago,
                        corTotal: '#52c41a',
                      }} />

                      <DRELinha separador />

                      {/* A RECEBER */}
                      <SecaoDRE s={{
                        titulo: 'A RECEBER (pendentes)',
                        sinal: '+',
                        itens: receitasAReceber.length > 0
                          ? [
                              { label: 'Parcelas / Medições pendentes', valor: totalRecPend },
                            ]
                          : [{ label: 'Sem receitas pendentes', valor: 0 }],
                        total: totalRecPend,
                        corTotal: '#1677ff',
                      }} />

                      <DRELinha separador />

                      {/* DESPESAS PAGAS */}
                      <SecaoDRE s={{
                        titulo: 'DESPESAS PAGAS',
                        sinal: '-',
                        itens: categoriasDespPagas.length > 0
                          ? categoriasDespPagas
                          : [{ label: 'Sem despesas pagas', valor: 0 }],
                        total: totalDespPagas,
                        corTotal: '#ff4d4f',
                      }} />

                      <DRELinha separador />

                      {/* DESPESAS PENDENTES */}
                      <SecaoDRE s={{
                        titulo: 'DESPESAS A PAGAR (pendentes)',
                        sinal: '-',
                        itens: categoriasDespPend.length > 0
                          ? categoriasDespPend
                          : [{ label: 'Sem despesas pendentes', valor: 0 }],
                        total: totalDespPend,
                        corTotal: '#fa8c16',
                      }} />

                      {(totalDistPago > 0 || totalDistPend > 0) && (
                        <>
                          <DRELinha separador />
                          <SecaoDRE s={{
                            titulo: 'DISTRIBUIÇÃO DE LUCRO',
                            sinal: '-',
                            itens: [
                              { label: 'Já distribuído', valor: totalDistPago },
                              ...(totalDistPend > 0 ? [{ label: 'Pendente de distribuição', valor: totalDistPend }] : []),
                            ].filter(i => i.valor > 0),
                            total: totalDistPago + totalDistPend,
                          }} />
                        </>
                      )}
                    </Card>
                  </Col>

                  {/* Coluna resultado final */}
                  <Col xs={24} lg={10}>
                    <Card title="Resultado" size="small" style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <DRELinha label="Receitas realizadas" valor={totalRecPago} cor="#52c41a" />
                        <DRELinha label="(−) Despesas pagas" valor={totalDespPagas} cor="#ff4d4f" />
                        <DRELinha separador />
                        <DRELinha label="= Resultado Bruto" valor={resultadoBruto}
                          cor={resultadoBruto >= 0 ? '#52c41a' : '#ff4d4f'} destaque />
                        {totalDistPago > 0 && (
                          <>
                            <DRELinha label="(−) Distribuições realizadas" valor={totalDistPago} cor="#ff4d4f" />
                            <DRELinha label="= Resultado Líquido" valor={resultadoLiquido}
                              cor={resultadoLiquido >= 0 ? '#52c41a' : '#ff4d4f'} destaque />
                          </>
                        )}

                        <DRELinha separador />
                        <div style={{ padding: '8px 0 4px', fontSize: 12, color: '#8c8c8c', fontWeight: 600 }}>
                          PROJEÇÃO (realizado + pendente)
                        </div>
                        <DRELinha label="Total a receber" valor={totalRecPago + totalRecPend} cor="#1677ff" />
                        <DRELinha label="(−) Total a pagar" valor={totalDespPagas + totalDespPend} cor="#fa8c16" />
                        <DRELinha separador />
                        <DRELinha label="= Saldo Projetado" valor={saldoProjetado}
                          cor={saldoProjetado >= 0 ? '#52c41a' : '#ff4d4f'} destaque />
                      </div>
                    </Card>

                    {/* Mini KPIs */}
                    <Row gutter={[8, 8]}>
                      {[
                        { label: 'Recebido', v: totalRecPago, c: '#52c41a' },
                        { label: 'A Receber', v: totalRecPend, c: '#1677ff' },
                        { label: 'Despesas pagas', v: totalDespPagas, c: '#ff4d4f' },
                        { label: 'A Pagar', v: totalDespPend, c: '#fa8c16' },
                      ].map((k, i) => (
                        <Col xs={12} key={i}>
                          <Card size="small">
                            <div style={{ fontSize: 11, color: '#8c8c8c' }}>{k.label}</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: k.c }}>{formatarMoeda(k.v)}</div>
                          </Card>
                        </Col>
                      ))}
                    </Row>
                  </Col>
                </Row>
              </div>
            ),
          },

          // ── TAB 3: CONTAS A RECEBER (COMPLETO) ────────────────────────────
          {
            key: 'receber-completo',
            label: 'Contas a Receber',
            children: (
              <div>
                <style>{`
                  @media print {
                    .ant-layout-sider, .ant-layout-header { display: none !important; }
                    .ant-layout-content { padding: 8px 16px !important; }
                    .ant-tabs-nav, .no-print { display: none !important; }
                    body { background: white !important; }
                  }
                `}</style>

                <Row justify="space-between" align="middle" style={{ marginBottom: 16 }} gutter={[12, 12]}>
                  <Col>
                    <Title level={5} style={{ margin: 0 }}>Contas a Receber — Completo</Title>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Todos os lançamentos de receita, com ou sem obra vinculada
                    </Text>
                  </Col>
                  <Col>
                    <Space className="no-print" wrap>
                      <Input prefix={<SearchOutlined />} placeholder="Buscar..." allowClear
                        value={buscaReceber} onChange={e => setBuscaReceber(e.target.value)} style={{ width: 180 }} />
                      <Select value={statusFiltroReceber} onChange={setStatusFiltroReceber} style={{ width: 130 }}
                        options={[{ value: 'todos', label: 'Todos status' }, ...Object.entries(STATUS_LABEL).map(([v, l]) => ({ value: v, label: l }))]} />
                      <Select value={anoFiltroReceber} onChange={setAnoFiltroReceber} style={{ width: 110 }}
                        options={[{ value: 'todos', label: 'Todos' }, ...ANOS]} />
                      <Button icon={<PrinterOutlined />} onClick={() => window.print()}>Imprimir</Button>
                    </Space>
                  </Col>
                </Row>

                <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                  <Col xs={12} sm={6}>
                    <Card size="small"><Statistic title="Recebido" value={formatarMoeda(rcRecebido)} valueStyle={{ color: '#52c41a', fontSize: 16 }} /></Card>
                  </Col>
                  <Col xs={12} sm={6}>
                    <Card size="small"><Statistic title="Pendente" value={formatarMoeda(rcPendente)} valueStyle={{ color: '#faad14', fontSize: 16 }} /></Card>
                  </Col>
                  <Col xs={12} sm={6}>
                    <Card size="small"><Statistic title="Vencido" value={formatarMoeda(rcVencido)} valueStyle={{ color: '#ff4d4f', fontSize: 16 }} /></Card>
                  </Col>
                  <Col xs={12} sm={6}>
                    <Card size="small"><Statistic title="Total Geral" value={formatarMoeda(rcTotal)} valueStyle={{ fontSize: 16 }} /></Card>
                  </Col>
                </Row>

                <Table<Lancamento>
                  dataSource={receberCompleto}
                  rowKey="id"
                  size="small"
                  pagination={{ pageSize: 30, showTotal: t => `${t} lançamento(s)` }}
                  locale={{ emptyText: 'Nenhum lançamento encontrado.' }}
                  columns={[
                    { title: 'Descrição', dataIndex: 'descricao', render: (d: string, r) => (
                      <div>
                        <Text strong>{titleCase(d)}</Text>
                        {(r.obraNome || r.clienteNome) && (
                          <div><Text type="secondary" style={{ fontSize: 11 }}>{r.obraNome || r.clienteNome}</Text></div>
                        )}
                      </div>
                    )},
                    { title: 'Vencimento', dataIndex: 'vencimento', width: 110,
                      sorter: (a, b) => a.vencimento.localeCompare(b.vencimento),
                      render: (d: string) => formatarData(d) },
                    { title: 'Pagamento', dataIndex: 'pagamento', width: 110,
                      render: (d: string) => d ? formatarData(d) : <Text type="secondary">—</Text> },
                    { title: 'Status', dataIndex: 'status', width: 110,
                      render: (s: StatusLancamento) => <Tag color={STATUS_COLOR[s]}>{STATUS_LABEL[s]}</Tag> },
                    { title: 'Valor', dataIndex: 'valor', width: 130, align: 'right' as const,
                      sorter: (a, b) => a.valor - b.valor,
                      render: (v: number, r) => (
                        <Text strong style={{ color: r.status === 'pago' ? '#52c41a' : undefined }}>{formatarMoeda(v)}</Text>
                      )},
                  ]}
                  summary={() => (
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0} colSpan={4}><Text strong>Total (filtrado)</Text></Table.Summary.Cell>
                      <Table.Summary.Cell index={4} align="right">
                        <Text strong>{formatarMoeda(receberCompleto.reduce((s, l) => s + l.valor, 0))}</Text>
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                  )}
                />
              </div>
            ),
          },

          // ── TAB 4: RECEBER POR OBRA ──────────────────────────────────────
          {
            key: 'receber-obra',
            label: 'Receber por Obra',
            children: (
              <div>
                <style>{`
                  @media print {
                    .ant-layout-sider, .ant-layout-header { display: none !important; }
                    .ant-layout-content { padding: 8px 16px !important; }
                    .ant-tabs-nav, .no-print { display: none !important; }
                    body { background: white !important; }
                  }
                `}</style>

                <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
                  <Col>
                    <Title level={5} style={{ margin: 0 }}>Contas a Receber por Obra</Title>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Receitas agrupadas por obra — clique em uma linha para ver as parcelas
                    </Text>
                  </Col>
                  <Col>
                    <Space className="no-print">
                      <Text type="secondary">Período:</Text>
                      <Select value={anoFiltroReceber} onChange={setAnoFiltroReceber} style={{ width: 110 }}
                        options={[{ value: 'todos', label: 'Todos' }, ...ANOS]} />
                      <Button icon={<PrinterOutlined />} onClick={() => window.print()}>Imprimir</Button>
                    </Space>
                  </Col>
                </Row>

                <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                  <Col xs={12} sm={8}>
                    <Card size="small">
                      <Statistic title="Total Recebido" value={formatarMoeda(totRecebido)}
                        valueStyle={{ color: '#52c41a', fontSize: 16 }} />
                    </Card>
                  </Col>
                  <Col xs={12} sm={8}>
                    <Card size="small">
                      <Statistic title="Total Pendente" value={formatarMoeda(totPendente)}
                        valueStyle={{ color: '#faad14', fontSize: 16 }} />
                    </Card>
                  </Col>
                  <Col xs={24} sm={8}>
                    <Card size="small">
                      <Statistic title="Total Geral" value={formatarMoeda(totRecebido + totPendente)}
                        valueStyle={{ fontSize: 16 }} />
                    </Card>
                  </Col>
                </Row>

                <Table<ObraRec>
                  dataSource={receitasPorObra}
                  rowKey="id"
                  size="middle"
                  pagination={false}
                  locale={{ emptyText: 'Nenhuma receita encontrada.' }}
                  summary={() => (
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0}><Text strong>Total</Text></Table.Summary.Cell>
                      <Table.Summary.Cell index={1} />
                      <Table.Summary.Cell index={2} align="right">
                        <Text strong style={{ color: '#52c41a' }}>{formatarMoeda(totRecebido)}</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={3} align="right">
                        <Text strong style={{ color: '#faad14' }}>{formatarMoeda(totPendente)}</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={4} align="right">
                        <Text strong>{formatarMoeda(totRecebido + totPendente)}</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={5} />
                    </Table.Summary.Row>
                  )}
                  columns={[
                    {
                      title: 'Obra', dataIndex: 'nome',
                      render: (n: string, r: ObraRec) => (
                        <div>
                          <Text strong>{n}</Text>
                          {r.clienteNome && (
                            <div><Text type="secondary" style={{ fontSize: 11 }}>{r.clienteNome}</Text></div>
                          )}
                        </div>
                      ),
                    },
                    {
                      title: 'Status', dataIndex: 'status', width: 120,
                      render: (s: Obra['status']) => <ObraStatusTag status={s} />,
                    },
                    {
                      title: 'Recebido', key: 'recebido', width: 140, align: 'right' as const,
                      render: (_: unknown, r: ObraRec) => (
                        <Text strong style={{ color: '#52c41a' }}>{formatarMoeda(r.recebido)}</Text>
                      ),
                    },
                    {
                      title: 'Pendente', key: 'pendente', width: 140, align: 'right' as const,
                      render: (_: unknown, r: ObraRec) => (
                        <Text strong style={{ color: r.pendente > 0 ? '#faad14' : '#8c8c8c' }}>
                          {formatarMoeda(r.pendente)}
                        </Text>
                      ),
                    },
                    {
                      title: 'Total', key: 'total', width: 140, align: 'right' as const,
                      render: (_: unknown, r: ObraRec) => (
                        <Text strong>{formatarMoeda(r.recebido + r.pendente)}</Text>
                      ),
                    },
                    {
                      title: '% Rec.', key: 'pct', width: 110,
                      render: (_: unknown, r: ObraRec) => {
                        const base = r.recebido + r.pendente;
                        if (!base) return <Text type="secondary">—</Text>;
                        const pct = Math.round((r.recebido / base) * 100);
                        return <Progress percent={pct} size="small" />;
                      },
                    },
                  ]}
                  expandable={{
                    expandedRowRender: (r: ObraRec) => (
                      <Table<Lancamento>
                        dataSource={r.lancRec}
                        rowKey="id"
                        size="small"
                        pagination={false}
                        style={{ marginLeft: 24 }}
                        columns={[
                          {
                            title: 'Vencimento', dataIndex: 'vencimento', width: 110,
                            render: (d: string) => formatarData(d),
                          },
                          {
                            title: 'Pago em', dataIndex: 'pagamento', width: 110,
                            render: (d: string) => d ? formatarData(d) : <Text type="secondary">—</Text>,
                          },
                          {
                            title: 'Descrição', dataIndex: 'descricao',
                            render: (d: string) => titleCase(d),
                          },
                          {
                            title: 'Status', dataIndex: 'status', width: 110,
                            render: (s: StatusLancamento) => (
                              <Tag color={STATUS_COLOR[s]}>{STATUS_LABEL[s]}</Tag>
                            ),
                          },
                          {
                            title: 'Valor', dataIndex: 'valor', width: 130, align: 'right' as const,
                            render: (v: number, l: Lancamento) => (
                              <Text strong style={{ color: l.status === 'pago' ? '#52c41a' : '#faad14' }}>
                                {formatarMoeda(v)}
                              </Text>
                            ),
                          },
                        ]}
                      />
                    ),
                  }}
                />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
