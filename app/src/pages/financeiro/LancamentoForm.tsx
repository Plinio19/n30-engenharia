import { useEffect, useState } from 'react';
import { Drawer, Form, Input, InputNumber, Select, DatePicker, Space, Button, Switch, message } from 'antd';
import dayjs from 'dayjs';
import type { Lancamento, TipoLancamento, StatusLancamento } from '../../types';
import { useLancamentosStore } from '../../stores/useLancamentosStore';
import { useObrasStore } from '../../stores/useObrasStore';
import { uid, hoje, formatarMoeda } from '../../utils';

interface Props {
  tipo: TipoLancamento;
  lancamento: Lancamento | null;
  open: boolean;
  onClose: () => void;
}

const STATUS_OPTS: { value: StatusLancamento; label: string }[] = [
  { value: 'pendente',  label: 'Pendente' },
  { value: 'pago',      label: 'Pago / Recebido' },
  { value: 'vencido',   label: 'Vencido' },
  { value: 'cancelado', label: 'Cancelado' },
];

const CATEGORIAS_RECEITA = ['Contrato', 'Medição', 'Adiantamento', 'Reembolso', 'Outros'];
const CATEGORIAS_DESPESA = [
  'Material', 'Mão de obra', 'Aluguel equipamento', 'Transporte',
  'Escritório', 'Impostos', 'Serviços terceiros', 'Outros',
];

export default function LancamentoForm({ tipo, lancamento, open, onClose }: Props) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [parcelar, setParcelar] = useState(false);
  const { upsert, addMany } = useLancamentosStore();
  const { obras, fetch: fetchObras } = useObrasStore();

  const valorForm = Form.useWatch('valor', form);
  const numParcelasForm = Form.useWatch('numParcelas', form);

  // Só busca de novo se ainda não carregou nesta sessão — evita 1 requisição
  // extra ao GitHub toda vez que a gaveta é aberta.
  useEffect(() => { if (open && obras.length === 0) fetchObras(); }, [open]);

  useEffect(() => {
    if (!open) return;
    if (lancamento) {
      setParcelar(false);
      form.setFieldsValue({
        ...lancamento,
        vencimento: lancamento.vencimento ? dayjs(lancamento.vencimento) : null,
        pagamento:  lancamento.pagamento  ? dayjs(lancamento.pagamento)  : null,
      });
    } else {
      setParcelar(false);
      form.resetFields();
      form.setFieldsValue({ tipo, status: 'pendente', numParcelas: 2 });
    }
  }, [lancamento, open]);

  async function salvar() {
    let v: Record<string, unknown>;
    try { v = await form.validateFields(); }
    catch { return; }

    setSaving(true);
    try {
      const obraId = v.obraId as string | undefined;
      const obraNome = obras.find(o => o.id === obraId)?.nome;
      const descricaoBase = String(v.descricao || '');
      const valorTotal = Number(v.valor) || 0;
      const vencimentoBase = v.vencimento as dayjs.Dayjs;
      const status = (v.status as StatusLancamento) || 'pendente';
      const pagamento = v.pagamento ? (v.pagamento as dayjs.Dayjs).format('YYYY-MM-DD') : undefined;
      const categoria = v.categoria as string | undefined;
      const observacoes = v.observacoes as string | undefined;

      if (!lancamento && parcelar) {
        const n = Number(v.numParcelas) || 2;
        const grupoParcelamento = uid();
        // divide em centavos pra não perder/sobrar dinheiro no arredondamento — a diferença fica na última parcela
        const totalCentavos = Math.round(valorTotal * 100);
        const parcelaCentavos = Math.floor(totalCentavos / n);
        const restoCentavos = totalCentavos - parcelaCentavos * n;

        const novos: Lancamento[] = Array.from({ length: n }, (_, i) => {
          const valorParcela = (parcelaCentavos + (i === n - 1 ? restoCentavos : 0)) / 100;
          return {
            id: uid(),
            tipo,
            descricao: `${descricaoBase} (${i + 1}/${n})`,
            valor: valorParcela,
            vencimento: vencimentoBase.add(i, 'month').format('YYYY-MM-DD'),
            pagamento: i === 0 ? pagamento : undefined,
            status: i === 0 ? status : (status === 'pago' ? 'pendente' : status),
            obraId, obraNome, categoria, observacoes,
            grupoParcelamento, parcelaAtual: i + 1, totalParcelas: n,
            criadoEm: hoje(),
          };
        });
        await addMany(novos);
        message.success(`${n} parcelas criadas!`);
      } else {
        const novoLanc: Lancamento = {
          id:          lancamento?.id || uid(),
          tipo,
          descricao:   descricaoBase,
          valor:       valorTotal,
          vencimento:  vencimentoBase.format('YYYY-MM-DD'),
          pagamento,
          status,
          obraId, obraNome, categoria, observacoes,
          grupoParcelamento: lancamento?.grupoParcelamento,
          parcelaAtual: lancamento?.parcelaAtual,
          totalParcelas: lancamento?.totalParcelas,
          criadoEm:    lancamento?.criadoEm || hoje(),
        };
        await upsert(novoLanc);
        message.success(`Lançamento ${lancamento ? 'atualizado' : 'criado'}!`);
      }
      onClose();
    } catch (e) {
      message.error('Erro: ' + String(e));
    } finally {
      setSaving(false);
    }
  }

  const categorias = tipo === 'receita' ? CATEGORIAS_RECEITA : CATEGORIAS_DESPESA;
  const titulo = tipo === 'receita' ? 'Conta a Receber' : 'Conta a Pagar';
  const valorPorParcela = parcelar && valorForm && numParcelasForm
    ? Number(valorForm) / Number(numParcelasForm) : null;

  return (
    <Drawer
      title={lancamento ? `Editar: ${titulo}` : `Nova: ${titulo}`}
      open={open} onClose={onClose} width={520}
      footer={
        <Space style={{ float: 'right' }}>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="primary" loading={saving} onClick={salvar}>
            {lancamento ? 'Salvar alterações' : 'Criar lançamento'}
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical">
        <Form.Item name="descricao" label="Descrição" rules={[{ required: true }]}>
          <Input placeholder={tipo === 'receita' ? 'Ex: Fechamento contrato — Obra Silva' : 'Ex: Cimento Portland 50 sacos'} />
        </Form.Item>

        <Form.Item name="obraId" label="Obra vinculada">
          <Select showSearch optionFilterProp="label" allowClear placeholder="Selecione (opcional)"
            options={obras.map(o => ({ value: o.id, label: o.nome }))} />
        </Form.Item>

        <Form.Item name="categoria" label="Categoria">
          <Select options={categorias.map(c => ({ value: c, label: c }))} allowClear placeholder="Selecione" />
        </Form.Item>

        <Form.Item name="valor" label={parcelar ? 'Valor total' : 'Valor'} rules={[{ required: true }]}>
          <InputNumber style={{ width: '100%' }} prefix="R$" min={0} precision={2} />
        </Form.Item>

        <Form.Item name="vencimento" label={parcelar ? 'Vencimento da 1ª parcela' : 'Vencimento'} rules={[{ required: true }]}>
          <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
        </Form.Item>

        {!lancamento && (
          <Form.Item label="Fechou em várias parcelas?">
            <Switch checked={parcelar} onChange={setParcelar} />
          </Form.Item>
        )}

        {!lancamento && parcelar && (
          <>
            <Form.Item name="numParcelas" label="Número de parcelas" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} min={2} max={60} />
            </Form.Item>
            {valorPorParcela !== null && (
              <div style={{ marginTop: -12, marginBottom: 16, color: '#8c8c8c', fontSize: 13 }}>
                {numParcelasForm}x de {formatarMoeda(valorPorParcela)} — vencimentos mensais a partir da data acima
              </div>
            )}
          </>
        )}

        <Form.Item name="status" label={parcelar ? 'Status (aplicado à 1ª parcela)' : 'Status'}>
          <Select options={STATUS_OPTS} />
        </Form.Item>

        <Form.Item name="pagamento" label="Data de pagamento / recebimento">
          <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
        </Form.Item>

        <Form.Item name="observacoes" label="Observações">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
