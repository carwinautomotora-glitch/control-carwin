const clpFormatter = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const ufFormatter = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percentFormatter = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const money = (value: number) => clpFormatter.format(value);

export const formatUf = (value: number) => `${ufFormatter.format(value)} UF`;

export const formatPercent = (value: number) => `${percentFormatter.format(value)}%`;

export const formatThousands = (value: number) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(value);
