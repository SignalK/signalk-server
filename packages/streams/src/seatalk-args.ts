const GPIO_PATTERN = /^GPIO\d{1,2}$/

// Values are interpolated into a shell command, so only known-safe tokens are passed through
export function seatalkArgs(gpio: unknown, gpioInvert: unknown): string {
  const safeGpio =
    typeof gpio === 'string' && GPIO_PATTERN.test(gpio) ? gpio : 'undefined'
  const safeInvert = String(gpioInvert) === 'true' ? 'true' : 'false'
  return `${safeGpio} ${safeInvert}`
}
