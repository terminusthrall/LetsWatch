export function computeDeadlineAt(
  deadlineOption: string,
  customDeadline: string,
  now = new Date()
): string {
  switch (deadlineOption) {
    case '1h':
      return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    case '3h':
      return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString();
    case '24h':
      return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    case 'tonight9pm': {
      const target = new Date(now);
      target.setHours(21, 0, 0, 0);
      if (target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 1);
      }
      return target.toISOString();
    }
    case 'custom': {
      const d = new Date(customDeadline);
      if (isNaN(d.getTime()) || d.getTime() <= now.getTime()) {
        return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
      }
      return d.toISOString();
    }
    default:
      return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  }
}
