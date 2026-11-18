export const HOURS_OPTIONS = Array.from({ length: 24 }, (_, h) => {
  const period = h < 12 ? 'AM' : 'PM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return { value: h, label: `${display} ${period}` };
});
