import Replacer from '../packages/streams/src/replacer'

export function filter(regexp: string, input: string): Promise<string> {
  return new Promise((resolve) => {
    const replacer = new Replacer({ regexp, template: '' })
    const results: string[] = []
    replacer.on('data', (d: string) => results.push(d))
    replacer.write(input)
    replacer.end()
    replacer.on('finish', () => {
      resolve(results.length > 0 ? results[0] : '')
    })
  })
}
