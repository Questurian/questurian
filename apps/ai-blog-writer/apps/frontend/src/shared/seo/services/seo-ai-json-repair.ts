type JsonObjectState = 'keyOrEnd' | 'colon' | 'value' | 'commaOrEnd'
type JsonArrayState = 'valueOrEnd' | 'commaOrEnd'

type JsonContainer =
  | { type: 'object'; state: JsonObjectState }
  | { type: 'array'; state: JsonArrayState }

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
)

const isWhitespace = (value: string): boolean => /\s/.test(value)

const isPrimitiveStart = (value: string): boolean => (
  value === '-'
  || (value >= '0' && value <= '9')
  || value === 't'
  || value === 'f'
  || value === 'n'
)

function tryParseRecord(value: string): Record<string, unknown> | null {
  const parsed = JSON.parse(value)
  const record = asRecord(parsed)
  if (!record) {
    throw new Error('JSON root must be an object.')
  }
  return record
}

function repairJsonObjectCandidate(source: string): string {
  const firstBrace = source.indexOf('{')
  const candidate = (firstBrace >= 0 ? source.slice(firstBrace) : source).trim()
  if (!candidate) return candidate

  const output: string[] = []
  const stack: JsonContainer[] = []
  let index = 0

  const peek = (): JsonContainer | undefined => stack[stack.length - 1]

  const append = (value: string): void => {
    if (value) output.push(value)
  }

  const stripTrailingComma = (): void => {
    if (output[output.length - 1] === ',') {
      output.pop()
    }
  }

  const markValueComplete = (): void => {
    const container = peek()
    if (!container) return
    if (container.type === 'array' && container.state === 'valueOrEnd') {
      container.state = 'commaOrEnd'
      return
    }
    if (container.type === 'object' && container.state === 'value') {
      container.state = 'commaOrEnd'
    }
  }

  const prepareForValue = (): void => {
    const container = peek()
    if (!container) return

    if (container.type === 'array') {
      if (container.state === 'commaOrEnd') {
        append(',')
        container.state = 'valueOrEnd'
      }
      return
    }

    if (container.state === 'colon') {
      append(':')
      container.state = 'value'
    }
  }

  const readString = (kind: 'key' | 'value'): string => {
    let token = '"'
    index += 1
    let escape = false

    while (index < candidate.length) {
      const char = candidate[index]
      if (escape) {
        token += char
        escape = false
        index += 1
        continue
      }

      if (char === '\\') {
        token += char
        escape = true
        index += 1
        continue
      }

      if (char === '\n') {
        token += '\\n'
        index += 1
        continue
      }

      if (char === '\r') {
        token += '\\r'
        index += 1
        continue
      }

      if (char === '\t') {
        token += '\\t'
        index += 1
        continue
      }

      if (char === '"') {
        let lookahead = index + 1
        while (lookahead < candidate.length && isWhitespace(candidate[lookahead])) {
          lookahead += 1
        }
        const next = candidate[lookahead]
        const closesString = kind === 'key'
          ? next === ':'
          : next === undefined || next === ',' || next === '}' || next === ']'

        if (!closesString) {
          token += '\\"'
          index += 1
          continue
        }

        token += '"'
        index += 1
        return token
      }

      token += char
      index += 1
    }

    return `${token}"`
  }

  const readPrimitive = (): string => {
    const start = index
    while (index < candidate.length) {
      const char = candidate[index]
      if (isWhitespace(char) || char === ',' || char === '}' || char === ']') {
        break
      }
      index += 1
    }
    return candidate.slice(start, index)
  }

  while (index < candidate.length) {
    const char = candidate[index]

    if (isWhitespace(char)) {
      index += 1
      continue
    }

    if (char === '{') {
      prepareForValue()
      append('{')
      stack.push({ type: 'object', state: 'keyOrEnd' })
      index += 1
      continue
    }

    if (char === '[') {
      prepareForValue()
      append('[')
      stack.push({ type: 'array', state: 'valueOrEnd' })
      index += 1
      continue
    }

    if (char === '}') {
      const container = peek()
      if (container?.type === 'object') {
        if (container.state === 'colon' || container.state === 'value') {
          append('null')
        }
        stripTrailingComma()
        stack.pop()
        append('}')
        markValueComplete()
        index += 1
        if (stack.length === 0) break
        continue
      }
      index += 1
      continue
    }

    if (char === ']') {
      const container = peek()
      if (container?.type === 'array') {
        stripTrailingComma()
        stack.pop()
        append(']')
        markValueComplete()
        index += 1
        if (stack.length === 0) break
        continue
      }
      index += 1
      continue
    }

    if (char === ',') {
      const container = peek()
      if (container?.type === 'object') {
        container.state = 'keyOrEnd'
      } else if (container?.type === 'array') {
        container.state = 'valueOrEnd'
      }
      append(',')
      index += 1
      continue
    }

    if (char === ':') {
      const container = peek()
      if (container?.type === 'object') {
        container.state = 'value'
      }
      append(':')
      index += 1
      continue
    }

    if (char === '"') {
      const container = peek()
      if (container?.type === 'object') {
        if (container.state === 'commaOrEnd') {
          append(',')
          container.state = 'keyOrEnd'
        }

        if (container.state === 'colon') {
          append(':')
          container.state = 'value'
        }

        const isKey = container.state === 'keyOrEnd'
        append(readString(isKey ? 'key' : 'value'))

        if (isKey) {
          container.state = 'colon'
        } else if (container.state === 'value') {
          container.state = 'commaOrEnd'
        }
        continue
      }

      if (container?.type === 'array') {
        if (container.state === 'commaOrEnd') {
          append(',')
          container.state = 'valueOrEnd'
        }
        append(readString('value'))
        if (container.state === 'valueOrEnd') {
          container.state = 'commaOrEnd'
        }
        continue
      }

      append(readString('value'))
      continue
    }

    if (isPrimitiveStart(char)) {
      prepareForValue()
      append(readPrimitive())
      markValueComplete()
      continue
    }

    index += 1
  }

  while (stack.length > 0) {
    const container = stack.pop()
    if (!container) break

    if (container.type === 'object') {
      if (container.state === 'colon' || container.state === 'value') {
        append('null')
      }
      stripTrailingComma()
      append('}')
    } else {
      stripTrailingComma()
      append(']')
    }
    markValueComplete()
  }

  return output.join('')
}

export function extractJsonObjectFromAiResponse(value: string): Record<string, unknown> {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('AI returned empty SEO response.')
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const directCandidate = fencedMatch?.[1]?.trim() || trimmed

  try {
    return tryParseRecord(directCandidate)
  } catch {
    // Continue to object extraction and repair fallbacks.
  }

  const start = directCandidate.indexOf('{')
  const end = directCandidate.lastIndexOf('}')
  if (start < 0 || end <= start) {
    throw new Error('AI did not return valid SEO JSON.')
  }

  const extractedCandidate = directCandidate.slice(start, end + 1)

  try {
    return tryParseRecord(extractedCandidate)
  } catch {
    // Continue to repair fallback.
  }

  try {
    return tryParseRecord(repairJsonObjectCandidate(directCandidate.slice(start)))
  } catch (err) {
    throw new Error(err instanceof Error ? `AI SEO JSON parse failed: ${err.message}` : 'AI SEO JSON parse failed.')
  }
}
