export const normalizeLimit = (value: any, defaultValue = 10, max = 10) => {
  const num = Number(value) || defaultValue
  return Math.min(Math.max(num, 1), max)
}