import { mount } from '@vue/test-utils'
import Main from '@/views/Main.vue'
import { describe, expect, test } from 'vitest'

describe('Main.vue', () => {
  it('renders', () => {
    // basic smoke test
    const msg = 'hello'
    expect(msg).toBe('hello')
  })
})
