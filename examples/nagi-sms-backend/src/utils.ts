export function normalizePhone(phone: string): string {
  return phone.replace(/\s+/g, '').replace(/[^+\d]/g, '');
}

export function applyTemplate(
  message: string,
  variables?: Record<string, string>,
): string {
  if (!variables) return message;
  return Object.entries(variables).reduce((text, [key, value]) => {
    const pattern = new RegExp(`\\{\\{\\s*${escapeRegExp(key)}\\s*\\}\\}`, 'g');
    return text.replace(pattern, value);
  }, message);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
