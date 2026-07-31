export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatarPercentual(valor?: number | null, casasMax = 2): string {
  return (valor ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casasMax });
}

// ── Formatação de campos de valor (InputNumber) no padrão brasileiro ──
// Ex: enquanto digita, mostra "18.000,00" em vez do "18000.00" cru do navegador.
export function formatarInputMoeda(v: number | string | undefined | null): string {
  if (v === undefined || v === null || v === '') return '';
  const num = typeof v === 'string' ? Number(v.replace(/\./g, '').replace(',', '.')) : v;
  if (isNaN(num)) return '';
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function parseInputMoeda(v: string | undefined): number {
  if (!v) return 0;
  const n = Number(v.replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

export function formatarData(iso?: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function titleCase(s?: string | null): string {
  if (!s) return '';
  return s.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
}

export function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function gerarCodigo(prefixo: string, lista: { codigo?: string }[]): string {
  const nums = lista
    .map(i => parseInt((i.codigo || '').replace(/\D/g, ''), 10))
    .filter(n => !isNaN(n));
  const proximo = nums.length ? Math.max(...nums) + 1 : 1;
  return `${prefixo}-${String(proximo).padStart(4, '0')}`;
}
